// src/models/user.ts
import { Schema, model, HydratedDocument } from "mongoose";
import client from "@src/config/elasticsearch";
import { Client } from "@elastic/elasticsearch";

export interface IUser {
  accountName: string;
  userName: string;
  email: string;
  password: string;
  followersCount: number;
  followingCount: number;
  isPublic: boolean;
  bio: string;
  avatarUrl: string;
  hasNewNotifications: boolean;
  createdAt?: Date;
  googleId?: string;
}

export type IUserDocument = HydratedDocument<IUser>

// 同步到 Elasticsearch 的輔助函數
async function syncToElasticsearch(doc: IUserDocument, operation: 'index' | 'delete') {
  try {
    if (!doc || !client) return;

    if (operation === 'index') {
      await (client as Client).index({
        index: 'users',
        id: doc._id.toString(),
        body: {
          userName: doc.userName,
          accountName: doc.accountName,
          bio: doc.bio || '',
          isPublic: doc.isPublic,
          avatarUrl: doc.avatarUrl,
          followersCount: doc.followersCount,
          followingCount: doc.followingCount,
          createdAt: doc.createdAt
        },
      });
      console.log(`User ${doc._id} indexed in Elasticsearch`);
    } else if (operation === 'delete') {
      await (client as Client).delete({
        index: 'users',
        id: doc._id.toString(),
      });
      console.log(`User ${doc._id} deleted from Elasticsearch`);
    }
  } catch (error) {
    console.error(`Error during Elasticsearch ${operation} operation for user ${doc._id}:`, error);
  }
}

const userSchema: Schema = new Schema<IUserDocument>({
  accountName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 30,
  },
  userName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 30,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  followersCount: {
    type: Number,
    default: 0,
  },
  followingCount: {
    type: Number,
    default: 0,
  },
  isPublic: {
    type: Boolean,
    default: true,
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 160,
  },
  avatarUrl: {
    type: String,
    trim: true,
    default: "",
  },
  hasNewNotifications: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  googleId: {
    type: String,
  },
});

// 保存後同步到 Elasticsearch
userSchema.post('save', async function (doc: IUserDocument) {
  await syncToElasticsearch(doc, 'index');
});

// 更新後同步到 Elasticsearch
userSchema.post('findOneAndUpdate', async function (doc: IUserDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'index');
  }
});

// 刪除時從 Elasticsearch 移除
userSchema.post('findOneAndDelete', async function (doc: IUserDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

userSchema.post('deleteOne', async function (doc: IUserDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

userSchema.post('deleteMany', async function (doc: IUserDocument) {
  if (doc) {
    await syncToElasticsearch(doc, 'delete');
  }
});

userSchema.index({ accountName: 1 });
userSchema.index({ email: 1 });

export const User = model<IUserDocument>("User", userSchema);