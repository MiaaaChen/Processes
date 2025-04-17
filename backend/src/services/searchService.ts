// src/services/searchService.ts
import client from "@src/config/elasticsearch";
import { Post } from "@src/models/post";
import { User } from "@src/models/user";
// import { Comment } from "@src/models/comment";
import { IUserDocument } from "@src/models/user";
import { SearchRequest, SearchHit, ElasticGetResponse } from "@src/types/elasticsearch";
import { Follow } from "@src/models/follow";
import { Types } from "mongoose";

export class SearchService {
    /**
     * 搜索貼文
     * @param {string} query 搜索關鍵字
     * @param {string} cursor 游標（上一頁最後一筆資料的ID）
     * @param {number} limit 每頁數量
     * @param {string} currentUserId 當前登入用戶的ID（用於檢查追蹤關係）
     */
    async searchPosts(query: string, cursor?: string, limit: number = 10, currentUserId?: string) {
        try {
            let visibleUserIds = [];

            // 1. 獲取所有公開用戶的 ID
            const publicUsers = await User.find({ isPublic: true }).select('_id');
            visibleUserIds = publicUsers.map(user => user._id.toString());

            // 2. 如果用戶已登入，添加他追蹤的私人帳號
            if (currentUserId) {
                const followedUsers = await Follow.find({
                    follower: new Types.ObjectId(currentUserId),
                    status: 'accepted'  // 只考慮已接受的追蹤關係
                }).select('following');

                const followedUserIds = followedUsers.map(follow => follow.following.toString());

                // 合併公開用戶和已追蹤用戶的 ID，確保沒有重複
                visibleUserIds = [...new Set([...visibleUserIds, ...followedUserIds])];
            }

            const searchQuery: SearchRequest = {
                index: 'posts',
                body: {
                    size: limit + 1,
                    sort: [
                        { "_score": "desc" }
                    ],
                    query: {
                        bool: {
                            must: [
                                {
                                    bool: {
                                        should: [
                                            {
                                                match_phrase: {
                                                    content: {
                                                        query: query,
                                                        boost: 4
                                                    }
                                                }
                                            },
                                            {
                                                match: {
                                                    content: {
                                                        query: query,
                                                        operator: 'and',
                                                        boost: 2
                                                    }
                                                }
                                            },
                                            {
                                                term: {
                                                    'content.raw': {
                                                        value: query,
                                                        boost: 3
                                                    }
                                                }
                                            }
                                        ],
                                        minimum_should_match: 1
                                    }
                                }
                            ],
                            filter: [
                                {
                                    bool: {
                                        should: visibleUserIds.map(id => ({
                                            term: { "userId": id }
                                        }))
                                    }
                                }
                            ]
                        }
                    },
                    highlight: {
                        fields: {
                            content: {
                                type: "plain",
                                fragment_size: 150,
                                number_of_fragments: 1,
                                pre_tags: ["<em>"],
                                post_tags: ["</em>"]
                            }
                        }
                    }
                }
            };

            // 處理游標分頁
            if (cursor) {
                const cursorDoc = await client.get({
                    index: 'posts',
                    id: cursor
                }) as ElasticGetResponse;  // 使用正確的類型

                if (cursorDoc._source?.createdAt) {
                    searchQuery.body.search_after = [cursorDoc._source.createdAt];
                }
            }

            const result = await client.search(searchQuery);
            const hits = result.hits.hits as SearchHit[];

            const hasMore = hits.length > limit;
            if (hasMore) {
                hits.pop();
            }

            // 獲取完整的貼文資訊
            const posts = await Post.find({
                _id: { $in: hits.map(hit => hit._id) }
            }).populate('user', 'userName accountName avatarUrl');

            // 根據 Elasticsearch 的排序結果對 MongoDB 的結果進行排序
            const sortedPosts = hits.map(hit => ({
                post: posts.find(p => p._id.toString() === hit._id),
                highlight: hit.highlight?.content?.[0] || null,
                score: hit._score || 0
            })).filter(item => item.post)  // 過濾掉未找到的貼文
                .sort((a, b) => b.score - a.score);  // 按相關度排序

            return {
                posts: sortedPosts.map(({ post, highlight }) => ({
                    postId: post!._id,
                    author: {
                        id: post!.user._id,
                        userName: (post!.user as IUserDocument).userName,
                        accountName: (post!.user as IUserDocument).accountName,
                        avatarUrl: (post!.user as IUserDocument).avatarUrl
                    },
                    content: post!.content,
                    highlight: highlight, // 添加高亮內容
                    likesCount: post!.likesCount,
                    commentCount: post!.comments.length,
                    createdAt: post!.createdAt,
                    images: post!.images || []
                })),
                users: [],
                nextCursor: hasMore ? sortedPosts[sortedPosts.length - 1].post!._id : null
            };
        } catch (error) {
            console.error('Error in searchPosts:', error);
            throw error;
        }
    }

    /**
     * 搜索用戶
     */
    async searchUsers(query: string, currentUserId?: Types.ObjectId | string, limit: number = 10) {
        try {
            // 使用正則表達式進行不分大小寫的搜尋
            const searchRegex = new RegExp(query, 'i');

            // 搜尋用戶
            const users = await User.find({
                $or: [
                    { accountName: { $regex: searchRegex } },
                    { userName: { $regex: searchRegex } }
                ]
            })
                .select('_id userName accountName avatarUrl isPublic')
                .limit(limit);

            // 如果有當前用戶，獲取關注狀態
            let followData = null;
            if (currentUserId) {
                // 獲取所有被搜尋到的用戶的關注狀態
                const follows = await Follow.find({
                    follower: new Types.ObjectId(currentUserId),
                    following: { $in: users.map(user => user._id) }
                });

                // 建立一個 Map 來存儲關注狀態
                followData = new Map(
                    follows.map(follow => [
                        follow.following.toString(),
                        {
                            isFollowing: follow.status === 'accepted',
                            hasRequestedFollow: follow.status === 'pending'
                        }
                    ])
                );
            }

            // 格式化回傳結果
            const formattedUsers = users.map(user => {
                const followStatus = followData?.get(user._id.toString()) || {
                    isFollowing: false,
                    hasRequestedFollow: false
                };

                return {
                    id: user._id,
                    userName: user.userName,
                    accountName: user.accountName,
                    avatarUrl: user.avatarUrl,
                    isPublic: user.isPublic,
                    isFollowing: followStatus.isFollowing,
                    hasRequestedFollow: followStatus.hasRequestedFollow
                };
            });

            return {
                users: formattedUsers,
                posts: [],
                nextCursor: null // 暫時不實作分頁
            };
        } catch (error) {
            console.error('Error in searchUsers:', error);
            throw error;
        }
    }
}

export const searchService = new SearchService();