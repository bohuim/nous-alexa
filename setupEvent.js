const PubNub = require('pubnub')

const pubnub = new PubNub({
    publishKey: 'pub-c-8fd5e639-8131-4b76-867c-c38d0c1d15fc',
    subscribeKey: 'sub-c-7eaa1852-2563-11e7-bb8a-0619f8945a4f',
})

pubnub.publish(
    {
        channel: 'nous',
        message: {
            event: 'setup',
            questions: [
                'What are you strengths and weaknesses?', 
                'Describe a time you overcame a hardship.', 
                'Why you over any other candidate?'
            ]
        }
    }, 
    (status, event) => {
        console.log(status)
    }
)
