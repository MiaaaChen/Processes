// src/models/post.ts
import { Schema, Types, model, HydratedDocument } from "mongoose";
import { IUserDocument } from "@src/models/user";
import client from "@src/config/elasticsearch";
import { Client } from "@elastic/elasticsearch";

export interface IPost {
  user: Types.ObjectId | IUserDocument;
  content: string;
  images: { type: [string], default: [] },
  createdAt: Date;
  updatedAt: Date;
  likesCount: number;
  comments: Types.ObjectId[];
  isLiked?: boolean;
}

export type IPostDocument = HydratedDocument<IPost>;

const postSchema = new Schema<IPostDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 280,
    },
    images: {
      type: [String],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    likesCount: {
      type: Number,
      default: 0,
      index: true,
    },
    comments: [
      {
        type: Schema.Types.ObjectId,
        ref: "Comment",
        default: [],
      },
    ],
  },
  { timestamps: true }
);

// Elasticsearch 同步中間件
async function syncToElasticsearch(doc: IPostDocument, operation: 'index' | 'delete') {
  try {
    if (!doc || !client) return;

    // 確保 user 字段被填充
    if (typeof doc.user === 'object' && !doc.populated('user')) {
      await doc.populate('user', 'userName accountName');
    }

    if (operation === 'index') {
      await (client as Client).index({
        index: 'posts',
        id: doc._id.toString(),
        body: {
          content: doc.content,
          userId: doc.user._id.toString(),
          userName: (doc.user as IUserDocument).userName,
          accountName: (doc.user as IUserDocument).accountName,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt
        },
      });
      console.log(`Post ${doc._id} indexed in Elasticsearch`);
    } else if (operation === 'delete') {
      await (client as Client).delete({
        index: 'posts',
        id: doc._id.toString(),
      });
      console.log(`Post ${doc._id} deleted from Elasticsearch`);
    }
  } catch (error) {
    console.error(`Error during Elasticsearch ${operation} operation for post ${doc._id}:`, error);
    // 在生產環境中，你可能想要添加重試機制或報警通知
  }
}

// 保存後同步到 Elasticsearch
postSchema.post('save', async function (doc: IPostDocument) {
  await syncToElasticsearch(doc, 'index');
});

// 更新後同步到 Elasticsearch
postSchema.post('findOneAndUpdate', async function (doc: IPostDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'index');
  }
});

// 刪除時從 Elasticsearch 移除
postSchema.post('findOneAndDelete', async function (doc: IPostDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

postSchema.post('deleteOne', async function (doc: IPostDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

postSchema.post('deleteMany', async function (doc: IPostDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

// 複合索引
postSchema.index({ user: 1, createdAt: -1 });
postSchema.index({ createdAt: -1, _id: -1 });

export const Post = model<IPostDocument>("Post", postSchema);