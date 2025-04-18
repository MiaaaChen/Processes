// elasticSearchSetup.ts
import client from '@src/config/elasticsearch';
import { Post } from '@src/models/post';
import { User } from '@src/models/user';
import { IUserDocument } from '@src/models/user';

export async function setupElasticsearch() {
    try {
        // 檢查索引是否存在
        const postsIndexExists = await client.indices.exists({
            index: 'posts'
        });

        const usersIndexExists = await client.indices.exists({
            index: 'users'
        });

        // 創建貼文索引
        if (!postsIndexExists) {
            await client.indices.create({
                index: 'posts',
                settings: {
                    analysis: {
                        analyzer: {
                            chinese_analyzer: {
                                type: 'custom',
                                tokenizer: 'smartcn_tokenizer'
                            },
                            english_analyzer: {
                                type: 'custom',
                                tokenizer: 'standard',
                                filter: [
                                    'lowercase',
                                    'asciifolding',
                                    'english_stop',
                                    'english_stemmer',
                                    'english_possessive_stemmer',
                                    'edge_ngram_filter'
                                ]
                            }
                        },
                        filter: {
                            ngram_filter: {
                                type: 'ngram',
                                min_gram: 1,
                                max_gram: 2
                            },
                            edge_ngram_filter: {
                                type: 'edge_ngram',
                                min_gram: 2,
                                max_gram: 15
                            },
                            english_stop: {
                                type: 'stop',
                                stopwords: '_english_'
                            },
                            english_stemmer: {
                                type: 'stemmer',
                                language: 'english'
                            },
                            english_possessive_stemmer: {
                                type: 'stemmer',
                                language: 'possessive_english'
                            }
                        }
                    }
                },
                mappings: {
                    properties: {
                        content: {
                            type: 'text',
                            analyzer: 'chinese_analyzer',
                            search_analyzer: 'chinese_analyzer',
                            fields: {
                                english: {
                                    type: 'text',
                                    analyzer: 'english_analyzer',
                                    search_analyzer: 'english_analyzer'
                                }
                            }
                        },
                        userId: { type: 'keyword' },
                        userName: {
                            type: 'text',
                            analyzer: 'chinese_analyzer',
                            fields: {
                                english: {
                                    type: 'text',
                                    analyzer: 'english_analyzer'
                                },
                                keyword: {
                                    type: 'keyword'
                                }
                            }
                        },
                        createdAt: { type: 'date' }
                    }
                }
            });
        }

        // 創建用戶索引
        if (!usersIndexExists) {
            await client.indices.create({
                index: 'users',
                settings: {
                    analysis: {
                        analyzer: {
                            chinese_analyzer: {
                                type: 'custom',
                                tokenizer: 'standard',
                                filter: [
                                    'lowercase',
                                    'asciifolding',
                                    'ngram_filter'
                                ],
                                char_filter: [
                                    'html_strip'
                                ]
                            },
                            english_analyzer: {
                                type: 'custom',
                                tokenizer: 'standard',
                                filter: [
                                    'lowercase',
                                    'asciifolding',
                                    'english_stop',
                                    'english_stemmer',
                                    'english_possessive_stemmer',
                                    'edge_ngram_filter'
                                ]
                            }
                        },
                        filter: {
                            ngram_filter: {
                                type: 'ngram',
                                min_gram: 1,
                                max_gram: 2
                            },
                            edge_ngram_filter: {
                                type: 'edge_ngram',
                                min_gram: 2,
                                max_gram: 15
                            },
                            english_stop: {
                                type: 'stop',
                                stopwords: '_english_'
                            },
                            english_stemmer: {
                                type: 'stemmer',
                                language: 'english'
                            },
                            english_possessive_stemmer: {
                                type: 'stemmer',
                                language: 'possessive_english'
                            }
                        }
                    }
                },
                mappings: {
                    properties: {
                        userName: {
                            type: 'text',
                            analyzer: 'chinese_analyzer',
                            fields: {
                                english: {
                                    type: 'text',
                                    analyzer: 'english_analyzer'
                                },
                                keyword: {
                                    type: 'keyword'
                                }
                            }
                        },
                        accountName: {
                            type: 'text',
                            analyzer: 'chinese_analyzer',
                            fields: {
                                english: {
                                    type: 'text',
                                    analyzer: 'english_analyzer'
                                },
                                keyword: {
                                    type: 'keyword'
                                }
                            }
                        },
                        bio: {
                            type: 'text',
                            analyzer: 'chinese_analyzer',
                            fields: {
                                english: {
                                    type: 'text',
                                    analyzer: 'english_analyzer'
                                }
                            }
                        },
                        isPublic: { type: 'boolean' },
                        avatarUrl: { type: 'keyword' },
                        followersCount: { type: 'integer' },
                        followingCount: { type: 'integer' },
                        createdAt: { type: 'date' }
                    }
                }
            });
        }

        // 同步現有的貼文
        const posts = await Post.find().populate('user', 'userName');
        const users = await User.find();

        // 如果有現有的貼文，執行批量索引
        if (posts.length > 0) {
            const bulkOperations = posts.flatMap(post => [
                { index: { _index: 'posts', _id: post._id.toString() } },
                {
                    content: post.content,
                    userId: post.user._id.toString(),
                    userName: (post.user as IUserDocument).userName,
                    createdAt: post.createdAt
                }
            ]);

            await client.bulk({
                operations: bulkOperations,
                refresh: true
            });
        }

        // 如果有現有的用戶，執行批量索引
        if (users.length > 0) {
            const bulkOperations = users.flatMap(user => [
                { index: { _index: 'users', _id: user._id.toString() } },
                {
                    userName: user.userName,
                    accountName: user.accountName,
                    bio: user.bio || '',
                    isPublic: user.isPublic,
                    avatarUrl: user.avatarUrl,
                    followersCount: user.followersCount,
                    followingCount: user.followingCount,
                    createdAt: user.createdAt
                }
            ]);

            await client.bulk({
                operations: bulkOperations,
                refresh: true
            });
        }

        console.log('Elasticsearch setup completed successfully');
    } catch (error) {
        console.error('Elasticsearch setup failed:', error);
        throw error;
    }
}