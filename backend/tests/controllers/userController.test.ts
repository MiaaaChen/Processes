import mongoose, { Types } from "mongoose";
import { User, IUserDocument } from "@src/models/user";
import { UserService } from "@src/services/userService";
import { UserController } from "@src/controllers/userController";
import { Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import "@tests/setup";
import redisClient from "@src/config/redis";
import { eventService } from "@src/services/eventService";

// 模擬 Response 對象
const mockResponse = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res as Response;
};

describe("UserController", () => {
    let testUser: IUserDocument;
    let anotherUser: IUserDocument;
    let controller: UserController;
    let userService: UserService;

    // 創建測試用戶的工廠函數
    const createTestUser = async (overrides = {}): Promise<IUserDocument> => {
        const userData = {
            accountName: "defaultAccountName",
            userName: "defaultUser",
            email: "default@example.com",
            password: "defaultPassword",
            ...overrides,
        };
        const user = new User(userData);
        await user.save();
        return user;
    };

    beforeEach(async () => {
        // 初始化 userService 和 controller，正確注入依賴
        userService = new UserService(redisClient, eventService);
        controller = new UserController(userService, redisClient);

        // 創建測試用戶
        testUser = await createTestUser({
            userName: "testuser",
            accountName: "testAccountName",
            email: "test@example.com",
            bio: "test bio",
            avatarUrl: "test-avatar.jpg",
        });
        anotherUser = await createTestUser({
            userName: "anotheruser",
            accountName: "anotherAccountName",
            email: "anothertets@example.com",
        });
    });

    describe("getUserProfile", () => {
        it("應該返回用戶資料，當用戶存在時", async () => {
            const req: Request<ParamsDictionary> = {
                params: { userId: testUser._id.toString() },
                user: testUser,
            } as unknown as Request<ParamsDictionary>;

            const res = mockResponse();

            await controller.getUserProfile(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: expect.any(mongoose.Types.ObjectId),
                    userName: "testuser",
                    accountName: "testAccountName",
                    bio: "test bio",
                    avatarUrl: "test-avatar.jpg",
                    followersCount: 0,
                    followingCount: 0,
                })
            );
        });

        it("應該回傳 404，當用戶不存在時", async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const req = {
                params: { userId: nonExistentId.toString() },
            } as unknown as Request;

            const res = mockResponse();
            await controller.getUserProfile(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ msg: "使用者不存在" });
        });
    });

    describe("updateUserProfile", () => {
        it("應該成功更新用戶資料", async () => {
            const req: Request = {
                user: testUser,
                body: {
                    userName: "newuserName",
                    email: "new@example.com",
                    bio: "new bio"
                },
                files: undefined
            } as unknown as Request;

            const res = mockResponse();

            await controller.updateUserProfile(req, res);

            // 由於 Redis 緩存和其他異步操作，等待一小段時間
            await new Promise(resolve => setTimeout(resolve, 100));

            // 驗證響應，只檢查必要的欄位
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    msg: "使用者資料已更新",
                    user: expect.objectContaining({
                        _id: expect.any(Types.ObjectId),
                        userName: "newuserName",
                        accountName: expect.any(String),
                        bio: expect.any(String),
                        avatarUrl: expect.any(String),
                        followersCount: expect.any(Number),
                        followingCount: expect.any(Number)
                    })
                })
            );

            // 驗證資料庫中的更新
            const updatedUser = await User.findById(testUser._id);
            expect(updatedUser).toBeDefined();
            expect(updatedUser!.userName).toBe("newuserName");
        });
    });

    describe("followUser", () => {
        it("應該成功關注另一個用戶", async () => {
            const req: Request = {
                body: { userId: anotherUser._id.toString() },
                user: testUser,
            } as Request;

            const res = mockResponse();
            jest.spyOn(userService, 'followUser').mockResolvedValue(true);
            await controller.followUser(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ msg: "成功追蹤使用者" });
        });

        it("應該回傳 404，當被關注的用戶不存在時", async () => {
            const nonExistentUserId = new mongoose.Types.ObjectId().toString();

            const req: Request = {
                body: { userId: nonExistentUserId },
                user: testUser,
            } as Request;

            const res = mockResponse();
            jest.spyOn(userService, 'followUser').mockResolvedValue(false);
            await controller.followUser(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ msg: "找不到或已經追蹤該使用者" });
        });

        it("應該回傳 404，當已經關注該用戶時", async () => {
            const req: Request = {
                body: { userId: anotherUser._id.toString() },
                user: testUser,
            } as Request;

            const res = mockResponse();
            jest.spyOn(userService, 'followUser').mockResolvedValue(false);
            await controller.followUser(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ msg: "找不到或已經追蹤該使用者" });
        });

        it("應該回傳 500，當發生伺服器錯誤時", async () => {
            const req: Request = {
                body: { userId: anotherUser._id.toString() },
                user: testUser,
            } as Request;

            const res = mockResponse();
            jest.spyOn(userService, 'followUser').mockRejectedValue(new Error("伺服器錯誤"));
            await controller.followUser(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    describe("unFollowUser", () => {
        it("應該成功取消關注另一個用戶", async () => {
            const req: Request = {
                body: { userId: anotherUser._id.toString() },
                user: testUser,
            } as Request;

            const res = mockResponse();
            jest.spyOn(userService, 'unfollowUser').mockResolvedValue(true);
            await controller.unfollowUser(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ msg: "成功取消追蹤使用者" });
        });

        it("應該回傳 404，當被取消關注的用戶不存在時", async () => {
            const nonExistentUserId = new mongoose.Types.ObjectId().toString();

            const req: Request = {
                body: { userId: nonExistentUserId },
                user: testUser,
            } as Request;

            const res = mockResponse();
            jest.spyOn(userService, 'unfollowUser').mockResolvedValue(false);
            await controller.unfollowUser(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ msg: "找不到或尚未追蹤該使用者" });
        });

        it("應該回傳 404，當尚未關注該用戶時", async () => {
            const req: Request = {
                body: { userId: anotherUser._id.toString() },
                user: testUser,
            } as Request;

            const res = mockResponse();
            jest.spyOn(userService, 'unfollowUser').mockResolvedValue(false);
            await controller.unfollowUser(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ msg: "找不到或尚未追蹤該使用者" });
        });
    });
});

