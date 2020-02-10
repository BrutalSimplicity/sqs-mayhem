import { Consumer } from 'sqs-consumer';

const app = Consumer.create({
    queueUrl: '',
    handleMessageBatch: async (messages) => {
        console.log(messages);
    }
});

app.start();