const PubNub = require('pubnub')

const pubnub = new PubNub({
    publishKey: 'pub-c-8fd5e639-8131-4b76-867c-c38d0c1d15fc',
    subscribeKey: 'sub-c-7eaa1852-2563-11e7-bb8a-0619f8945a4f',
})

// pubnub.publish(
//     {
//         channel: 'amzn1.account.AEV4GCSXQ7ZKY7AGTIETCYP4Y46A',
//         message: {
//             event: 'setup',
//             questions: [
//                 'What are you strengths and weaknesses?', 
//                 'Describe a time you overcame a hardship.', 
//                 'Why you over any other candidate?'
//             ]
//         }
//     }, 
//     (status, event) => {
//         console.log(status)
//     }
// )

pubnub.publish(
    {
        channel: 'amzn1.account.AEV4GCSXQ7ZKY7AGTIETCYP4Y46A',
        message: {
            event: 'standby',
            timeout: 5 * 60 * 1000
        }
    }, 
    (status, event) => {
        console.log(status)
    }
)
