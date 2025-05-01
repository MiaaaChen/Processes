// src/models/comment.ts
import { Schema, Types, model, HydratedDocument } from "mongoose";
import client from "@src/config/elasticsearch";
import { Client } from "@elastic/elasticsearch";
import { IUserDocument } from "./user";

export interface IComment {
  user: Types.ObjectId | IUserDocument;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  likesCount: number;
  comments: Types.ObjectId[];
}

export type ICommentDocument = HydratedDocument<IComment>;

// 同步到 Elasticsearch 的輔助函數
async function syncToElasticsearch(doc: ICommentDocument, operation: 'index' | 'delete') {
  try {
    if (!doc || !client) return;

    // 確保 user 字段被填充
    if (!doc.populated('user')) {
      await doc.populate('user', 'userName accountName avatarUrl');
    }

    if (operation === 'index') {
      // 確保 user 是完整的 document 而不是 ObjectId
      const user = doc.user as unknown as IUserDocument;

      await (client as Client).index({
        index: 'comments',
        id: doc._id.toString(),
        body: {
          content: doc.content,
          userId: user._id.toString(),
          userName: user.userName,
          accountName: user.accountName,
          avatarUrl: user.avatarUrl,
          likesCount: doc.likesCount,
          repliesCount: doc.comments.length,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt
        },
      });
      console.log(`Comment ${doc._id} indexed in Elasticsearch`);
    } else if (operation === 'delete') {
      await (client as Client).delete({
        index: 'comments',
        id: doc._id.toString(),
      });
      console.log(`Comment ${doc._id} deleted from Elasticsearch`);
    }
  } catch (error) {
    console.error(`Error during Elasticsearch ${operation} operation for comment ${doc._id}:`, error);
  }
}

const commentSchema = new Schema<ICommentDocument>(
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

// 保存後同步到 Elasticsearch
commentSchema.post('save', async function (doc: ICommentDocument) {
  await syncToElasticsearch(doc, 'index');
});

// 更新後同步到 Elasticsearch
commentSchema.post('findOneAndUpdate', async function (doc: ICommentDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'index');
  }
});

// 刪除時從 Elasticsearch 移除
commentSchema.post('findOneAndDelete', async function (doc: ICommentDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

commentSchema.post('deleteOne', async function (doc: ICommentDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

commentSchema.post('deleteMany', async function (doc: ICommentDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

// 複合索引
commentSchema.index({ user: 1, createdAt: -1 });
commentSchema.index({ createdAt: -1 });

export const Comment = model<ICommentDocument>("Comment", commentSchema);