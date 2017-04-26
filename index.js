
// Set NODE_ENV to produciton on lambda
const PROD = process.env.NODE_ENV === 'production'

if (PROD)
    module.change_code = 1

// --------------------
// Requires
// --------------------
const Alexa = require('alexa-app')

const PubNub = require('pubnub')
const rp = require('request-promise')

const newPubNub = () => new PubNub({
    publishKey: 'pub-c-8fd5e639-8131-4b76-867c-c38d0c1d15fc',
    subscribeKey: 'sub-c-7eaa1852-2563-11e7-bb8a-0619f8945a4f',
})

const app = new Alexa.app('nous')


// --------------------
// Constants
// --------------------
const json = (x) => JSON.stringify(x)
const parse = (x) => JSON.parse(x)

const AmazonProfile = Object.freeze({
    endpoint: 'https://api.amazon.com/user/profile'
})

const DB = Object.freeze({
    endpoint: 'https://y7sn9xsm9h.execute-api.us-east-1.amazonaws.com/prod/NousDB',

    Sessions: {
        tableName: 'NousSessions',
        aaid: 'AAID',
        timestamp: 'Timestamp',
        questions: 'Questions',
        answers: 'Answers',
    },
})

const SessionKey = Object.freeze({
    aaid: 'aaid',
    name: 'name',

    state: 'state',
    invalid: 'invalid',
    iteration: 'iteration',

    count: 'count',
    index: 'index',
    current: 'current',
    answers: 'answers',
    questions: 'questions',
})

const State = Object.freeze({
    standby: 'StandbyState',
    setup: 'SetupState',
    fetch: 'FetchState',
    question: 'QuestionState',
    finish: 'FinishState',
})


// --------------------
// App
// --------------------

Alexa.response.prototype.reply = function(msg)
{
    return this.say(msg).shouldEndSession(false);
}

Alexa.response.prototype.error = function(msg)
{
    return this.say(msg).shouldEndSession(true);
}

app.launch((request, response) =>
{
    const session = request.getSession()
    if (!session)
        return response.say('Sorry, could not retrieve the session. Exiting Nous.').shouldEndSession(true)

    if (!PROD) {
        // In dev, don't get profile.
        const test = 'test'
        session.set(SessionKey.aaid, test)
        session.set(SessionKey.name, test)
        return standbyState(session, response)
    }

    const token = request.data.session.user.accessToken
    if (!token)
        return response.linkAccount().reply('Please link your Amazon account to continue.')

    // Retreive profile using token, and enter standby.
    return rp.get({
        uri: AmazonProfile.endpoint,
        qs: { access_token: token },
        json: true
    })
    .then(profile =>
    {
        console.log('--- LAUNCH: Retreive profile success ---')
        console.log(profile)

        session.set(SessionKey.aaid, profile.user_id)
        session.set(SessionKey.name, profile.name)
        return standbyState(session, response)
    })
    .catch(error =>
    {
        console.log('--- LAUNCH: Retreive profile error ---')
        console.log(error)
        return response.error('Sorry, an error occurred while getting your profile. Exiting Nous.')
    })
})

app.sessionEnded((request, response) =>
{
    const session = request.getSession()
    if (session)
        session.clear()

    const goodbye = 'Exiting Nous.'
    return response.say(goodbye).shouldEndSession(true)
})


// --------------------
// States
// --------------------

function invalidSession(response)
{
    return response.say('Sorry, failed to retreive the session.').shouldEndSession(true)
}

function invalidResponse(session, response)
{
    const reply = session.get(SessionKey.invalid) || "Invalid response."
    return response.reply(reply)
}

function standbyState(session, response)
{
    session.set(SessionKey.state, State.standby)
    session.set(SessionKey.invalid, 'Please answer with yes or no.')

    const firstName = session.get(SessionKey.name).split(' ')[0]

    const greeting = `Hi ${firstName}, `
    const reprompt = 'if you want to do a mock interview, please say yes, then setup through the web portal.'
    return response.reply(greeting + reprompt).reprompt(reprompt)
}

function setupState(session, response)
{
    session.set(SessionKey.state, State.setup)
    session.set(SessionKey.invalid, '')

    return new Promise((resolve, reject) => {
        // Listen for PubNub sub message.
        const pubnub = newPubNub()

        const listener = {}
        listener.message = (payload) => {
            pubnub.destroy()

            const message = payload.message
            const event = message.event
            const questions = message.questions
            
            if (event === 'status' && Array.isArray(questions))
                resolve(questions)
        }

        pubnub.addListener(listener)
        pubnub.subscribe({ channels: ['nous'] })
    })
    .then(questions => {
        session.set(SessionKey.questions, json(questions))
        session.set(SessionKey.answers, json([]))
        session.set(SessionKey.count, json(questions.length))

        return questionState(questions[0], 0, session, response)
    })
    .catch(error => {
        // TODO: reject promise with timeout
    })
}

function questionState(question, index, session, response)
{
    console.log('--- QUESITON STATE ---')
    console.log('index: ', index)
    console.log('question: ', question)

    session.set(SessionKey.state, State.question)
    session.set(SessionKey.index, String(index))
    session.set(SessionKey.current, '')

    const count = parse( session.get(SessionKey.count) )

    // Pause in ms
    const pause = (t) => `<break time="${t}ms" />`

    let reply = ''
    if (index === 0)
    {
        reply += 'Let\'s start the interview. '
        reply += 'Each phrase will be added as the answer for the current question. '
        reply += `Say next ${pause(150)} to move onto the next question. `
        reply += `The first question is ${pause(150)} ${question}`
    }
    else if (index < count - 1)
        reply += `Next question: ${pause(150)} ${question}`
    else
        reply += `Last question: ${pause(150)} ${question}`

    return response.reply(reply)
}

function finishState(questions, answers, session, response)
{
    const k = DB.Sessions
    const item = {}
    item[k.aaid] = session.get(SessionKey.aaid)
    item[k.timestamp] = Math.floor(Date.now() / 1000)
    item[k.questions] = questions
    item[k.answers] = answers.map(x => x.length > 0 ? x : 'test')

    return rp.post({
        uri: DB.endpoint,
        json: true,
        body: {
            TableName: k.tableName,
            Item: item,
        }
    })
    .then(() => {
        response.reply('Saved the session. ')
        return standbyState(session, response)
    })
    .catch(error => {
        console.log(error)
        return response.error('Sorry, an error occurred while saving the session. Exiting Nous.')
    })
}


// --------------------
// Intents
// --------------------
const Intent = Object.freeze({
    freeform: 'FreeformIntent',
    yes: 'AMAZON.YesIntent',
    no: 'AMAZON.NoIntent',
    next: 'AMAZON.NextIntent',
    stop: 'AMAZON.StopIntent',
})

app.intent(Intent.yes, {},
    (request, response) =>
    {
        console.log('--- YesIntent ---')

        const session = request.getSession()
        if (!session)
            return response.say('Sorry, could not retrieve the session.').shouldEndSession(true)

        const state = session.get(SessionKey.state)
        if (state === State.standby)
            return setupState(session, response)

        return invalidResponse(session, response)
    }
)

app.intent(Intent.no, {},
    (request, response) =>
    {
        const session = request.getSession()
        if (!session)
            return invalidSession(response)

        const state = session.get(SessionKey.state)
        if (state === State.standby)
            return response.shouldEndSession(true).send()

        return invalidResponse(session, response)
    }
)

app.intent(Intent.freeform,
    {
        slots: { 'freeform': 'Freeform' },
        utterances: ['{-|Freeform}']
    },
    (request, response) =>
    {
        const session = request.getSession()
        if (!session)
            return invalidSession(response)

        const state = session.get(SessionKey.state)
        if (state !== State.question)
            return invalidSession(response)

        const input = request.slot('freeform')
        if (input.lenth < 1)
            return response.reply("Sorry, I didn't quite get that.")

        var current = session.get(SessionKey.current)
        current += (current.length > 0 ? ' ' : '') + 

        session.set(SessionKey.current, current)
        return response.reply('Recorded')
    }
)

app.intent(Intent.next, {},
    (request, response) =>
    {
        const session = request.getSession()
        if (!session)
            return invalidSession(response)

        const state = session.get(SessionKey.state)
        if (state !== State.question)
            return invalidSession(response)

        // Update session.
        const questions = JSON.parse( session.get(SessionKey.questions) )
        const index = JSON.parse( session.get(SessionKey.index) ) + 1

        const current = session.get(SessionKey.current)
        session.set(SessionKey.current, '')

        var answers = JSON.parse( session.get(SessionKey.answers) )
        answers = answers.concat(current)

        if (index < questions.length)
        {
            session.set(SessionKey.answers, JSON.stringify(answers))
            return questionState(questions[index], index, session, response)
        }

        return finishState(questions, answers, session, response)
    }
)

module.exports = app
