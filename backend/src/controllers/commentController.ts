// controllers/commentController.ts
import { Request, Response } from "express";
import { commentService, CommentService } from "@src/services/commentService";
import { IUserDocument } from "@src/models/user";
import { Types } from 'mongoose';

export class CommentController {
    constructor(private commentService: CommentService = new CommentService()) { }

    /**
     * 建立新評論
     * POST /api/comments
     */
    createComment = async (req: Request, res: Response): Promise<void> => {
        try {
            const { content } = req.body;
            const userId = (req.user as IUserDocument)._id;

            const result = await this.commentService.createComment(userId, content);

            if (!result) {
                res.status(400).json({ msg: "無法建立評論" });
                return;
            }

            res.status(201).json({ msg: "Comment created successfully" });
        } catch (error) {
            console.error('Error in createComment:', error);
            res.status(500).json({ msg: "伺服器錯誤" });
        }
    }

    /**
     * 更新評論
     * PATCH /api/comments/:commentId
     */
    updateComment = async (req: Request, res: Response): Promise<void> => {
        try {
            const { commentId } = req.params;
            const { content } = req.body;
            const userId = (req.user as IUserDocument)._id;

            const result = await this.commentService.updateComment(
                new Types.ObjectId(commentId),
                userId,
                content
            );

            if (!result) {
                res.status(404).json({ msg: "評論不存在或無權限修改" });
                return;
            }

            res.status(200).json({ msg: "Comment updated successfully" });
        } catch (error) {
            console.error('Error in updateComment:', error);
            res.status(500).json({ msg: "伺服器錯誤" });
        }
    }

    /**
     * 刪除評論
     * DELETE /api/comments/:commentId
     */
    deleteComment = async (req: Request, res: Response): Promise<void> => {
        try {
            const { commentId } = req.params;
            const userId = (req.user as IUserDocument)._id;

            const result = await this.commentService.deleteComment(
                new Types.ObjectId(commentId),
                userId
            );

            if (!result) {
                res.status(404).json({ msg: "評論不存在或無權限刪除" });
                return;
            }

            res.status(200).json({ msg: "Comment deleted successfully" });
        } catch (error) {
            console.error('Error in deleteComment:', error);
            res.status(500).json({ msg: "伺服器錯誤" });
        }
    }

    /**
     * 處理評論按讚
     * POST /api/comments/:commentId/like
     * 
     * 使用場景：
     * - 當用戶點擊空心愛心時調用
     * - 前端需確保只在未按讚狀態下調用
     * 
     * @param {Request} req - 請求物件，需包含 commentId 參數和認證用戶資訊
     * @param {Response} res - 回應物件
     */
    likeComment = async (req: Request, res: Response): Promise<void> => {
        try {
            const { commentId } = req.params;
            const userId = (req.user as IUserDocument)._id;

            const success = await this.commentService.likeComment(
                new Types.ObjectId(commentId),
                userId
            );

            if (!success) {
                res.status(404).json({
                    success: false,
                    message: "評論不存在"
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: "已按讚"
            });
        } catch (error) {
            console.error('Error in likeComment controller:', error);
            res.status(500).json({
                success: false,
                message: '伺服器錯誤'
            });
        }
    }

    /**
     * 處理取消評論按讚
     * DELETE /api/comments/:commentId/like
     * 
     * 使用場景：
     * - 當用戶點擊紅色愛心時調用
     * - 前端需確保只在已按讚狀態下調用
     * 
     * @param {Request} req - 請求物件，需包含 commentId 參數和認證用戶資訊
     * @param {Response} res - 回應物件
     */
    unlikeComment = async (req: Request, res: Response): Promise<void> => {
        try {
            const { commentId } = req.params;
            const userId = (req.user as IUserDocument)._id;

            const success = await this.commentService.unlikeComment(
                new Types.ObjectId(commentId),
                userId
            );

            if (!success) {
                res.status(404).json({
                    success: false,
                    message: "找不到按讚記錄"
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: "已取消按讚"
            });
        } catch (error) {
            console.error('Error in unlikeComment controller:', error);
            res.status(500).json({
                success: false,
                message: '伺服器錯誤'
            });
        }
    }
}

// 預設導出一個實例，方便直接使用
export const commentController = new CommentController(commentService);