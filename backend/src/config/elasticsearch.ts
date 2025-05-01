import { Client } from '@elastic/elasticsearch';

let client: Client | null = null;

const node = process.env.ELASTICSEARCH_NODE;
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;

if (node && username && password) {
  client = new Client({
    node,
    auth: {
      username,
      password,
    },
  });
} else {
  console.warn("Elasticsearch environment variables not set. Search features are disabled.");
}

export default client;