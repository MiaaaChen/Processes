import { Client } from '@elastic/elasticsearch';

const client = new Client({
    node: process.env.ELASTICSEARCH_URL,
    auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
        ? {
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
        }
        : undefined,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    }
});

export default client;