import React, { useEffect, useState, useCallback } from "react";
import {
  Avatar,
  Box,
  Divider,
  Typography,
  CircularProgress,
  Button,
  Menu,
  MenuItem,
} from "@mui/material";
import PostDialog from "../components/PostDialog";
import usePostHandler from "../hooks/usePostHandler";
import { useUser } from "../contexts/UserContext";
import DeleteConfirmation from "../components/DeleteConfirmation";
import PostList from "../components/PostList";

interface Post {
  postId: string;
  author: {
    id: string;
    userName: string;
    accountName: string;
    avatarUrl: string;
  };
  content: string;
  images: string[];
  likesCount: number;
  commentCount: number;
  createdAt: string;
  isLiked: boolean;
}

const Posts: React.FC = () => {
  const { userData } = useUser();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updatedContent, setUpdatedContent] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { dialogOpen, handleOpenDialog, handleCloseDialog, handleSubmit } =
    usePostHandler();

  const fetchPosts = useCallback(async () => {
    if (!userData?.userId) {
      console.error("User ID is missing in fetchPosts");
      return;
    }

    try {
      setLoading(true);

      const token = localStorage.getItem("token");
      if (!token) {
        console.error("Token is missing in localStorage");
        return;
      }

      const response = await fetch(`/api/post/${userData.userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
      }

      const data = await response.json();
      setPosts(data.posts || []);
    } catch (error) {
      console.error("Error fetching user posts:", error);
    } finally {
      setLoading(false);
    }
  }, [userData?.userId]);

  const handleCreatePost = async (formData: FormData) => {
    try {
      await handleSubmit(formData);
      await fetchPosts();
    } catch (error) {
      console.error("Error creating post:", error);
    }
  };

  const handleUpdatePost = async (formData: FormData) => {
    if (!selectedPost) return;

    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await fetch(`/api/post/${selectedPost.postId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to update post");

      await fetchPosts();
      setUpdateDialogOpen(false);
    } catch (error) {
      console.error("Error updating post:", error);
      alert("更新失敗，請稍後再試。");
    }
  };

  const handleDeletePost = async () => {
    if (!selectedPost) return;

    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await fetch(`/api/post/${selectedPost.postId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete post: ${response.status}`);
      }

      setPosts((prev) =>
        prev.filter((post) => post.postId !== selectedPost.postId),
      );
      console.log("Post deleted successfully");
      handleMenuClose();
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("刪除失敗，請稍後再試。");
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, post: Post) => {
    setAnchorEl(event.currentTarget);
    setSelectedPost(post);
    setUpdatedContent(post.content);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedPost(null);
  };

  const handleConfirmDeleteOpen = () => setConfirmDeleteOpen(true);
  const handleConfirmDeleteClose = () => setConfirmDeleteOpen(false);

  const handleToggleLike = async (postId: string, liked: boolean) => {
    const token = localStorage.getItem("token");
    const method = liked ? "DELETE" : "POST";

    // 即時更新 UI 狀態
    setPosts((prev) =>
      prev.map((post) =>
        post.postId === postId
          ? {
              ...post,
              likesCount: post.isLiked
                ? post.likesCount - 1
                : post.likesCount + 1,
              isLiked: !post.isLiked,
            }
          : post,
      ),
    );

    try {
      const response = await fetch(`/api/post/${postId}/like`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to toggle like");
      }
    } catch (error) {
      console.error("Error toggling like:", error);

      setPosts((prev) =>
        prev.map((post) =>
          post.postId === postId
            ? {
                ...post,
                likesCount: post.isLiked
                  ? post.likesCount + 1
                  : post.likesCount - 1,
                isLiked: post.isLiked,
              }
            : post,
        ),
      );
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <Box>
      {/* 發佈貼文框 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          margin: "18px 0",
          cursor: "pointer",
        }}
        onClick={handleOpenDialog}
      >
        <Avatar
          src={userData?.avatarUrl}
          alt="User Avatar"
          sx={{ width: 40, height: 40, marginRight: "16px" }}
        />
        <Typography sx={{ color: "#ccc", flexGrow: 1, fontSize: "15px" }}>
          有什麼新鮮事？
        </Typography>
        <Button
          variant="outlined"
          sx={{
            textTransform: "none",
            borderRadius: "10px",
            padding: "4px 16px",
            color: "#000",
            borderColor: "#ccc",
            fontSize: "15px",
            fontWeight: "bold",
          }}
        >
          發佈
        </Button>
      </Box>

      <PostDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSubmit={handleCreatePost}
        initialContent=""
        initialImages={[]}
        title="新串文"
      />

      <Divider sx={{ marginY: "16px" }} />

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <PostList
          posts={posts}
          onToggleLike={handleToggleLike}
          onMenuOpen={handleMenuOpen}
          showActions
        />
      )}

      <Menu
        anchorEl={anchorEl || document.body}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { width: 150, borderRadius: "10px" },
        }}
      >
        <MenuItem
          onClick={() => setUpdateDialogOpen(true)}
          sx={{ color: "black" }}
        >
          編輯
        </MenuItem>
        <MenuItem onClick={handleConfirmDeleteOpen} sx={{ color: "red" }}>
          刪除
        </MenuItem>
      </Menu>

      {/* 更新對話框 */}
      <PostDialog
        open={updateDialogOpen}
        onClose={() => {
          setUpdateDialogOpen(false);
          handleMenuClose();
        }}
        onSubmit={handleUpdatePost}
        initialContent={updatedContent}
        initialImages={selectedPost?.images || []}
        title="編輯貼文"
      />

      <DeleteConfirmation
        open={confirmDeleteOpen}
        onClose={handleConfirmDeleteClose}
        onConfirm={handleDeletePost}
        title="刪除貼文？"
        content="刪除這則貼文後，即無法恢復顯示。"
      />
    </Box>
  );
};

export default Posts;
