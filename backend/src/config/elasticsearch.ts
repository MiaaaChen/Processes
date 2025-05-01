// elasticsearch.ts
import { Client } from '@elastic/elasticsearch';

let client: Client | null = null;

if (process.env.ELASTICSEARCH_NODE && process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
  client = new Client({
    node: process.env.ELASTICSEARCH_NODE,
    auth: {
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD,
    },
  });
}

export default client;