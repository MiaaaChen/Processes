// @src/config/elasticsearch.ts
import { Client } from '@elastic/elasticsearch';

const client = new Client({
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    auth:
        process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
            ? {
                username: process.env.ELASTICSEARCH_USERNAME,
                password: process.env.ELASTICSEARCH_PASSWORD,
            }
            : undefined,
});

export default client;