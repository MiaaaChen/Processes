import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Avatar,
  CircularProgress,
  Tab,
  Tabs,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

interface UserResult {
  id: string;
  userName: string;
  accountName: string;
  avatarUrl: string;
  isPublic: boolean;
  isFollowing: boolean;
  hasRequestedFollow: boolean;
}

interface SearchResults {
  posts: Array<{
    postId: string;
    author: {
      id: string;
      userName: string;
      accountName: string;
      avatarUrl: string;
    };
    content: string;
    likesCount: number;
    commentCount: number;
    createdAt: string;
    isLiked: boolean;
  }>;
  users: UserResult[];
  nextCursor: string | null;
}

const Search: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 處理關注/取消關注
  const handleFollowToggle = async (user: UserResult) => {
    try {
      const token = localStorage.getItem("token");
      const action =
        user.isFollowing || user.hasRequestedFollow ? "unfollow" : "follow";

      await axios({
        method: "POST",
        url: `/api/user/${action}`,
        headers: { Authorization: `Bearer ${token}` },
        data: { userId: user.id },
      });

      // 更新本地狀態
      setSearchResults((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          users: prev.users.map((u) => {
            if (u.id === user.id) {
              if (action === "follow") {
                return {
                  ...u,
                  isFollowing: u.isPublic,
                  hasRequestedFollow: !u.isPublic,
                };
              } else {
                return {
                  ...u,
                  isFollowing: false,
                  hasRequestedFollow: false,
                };
              }
            }
            return u;
          }),
        };
      });
    } catch (error) {
      console.error("Failed to toggle follow status:", error);
    }
  };

  // 使用者清單項目組件
  const UserListItem: React.FC<{ user: UserResult }> = ({ user }) => {
    return (
      <Box
        sx={{
          padding: 2,
          borderBottom: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            flexGrow: 1,
          }}
          onClick={() => navigate(`/profile/${user.id}`)}
        >
          <Avatar src={user.avatarUrl} sx={{ width: 50, height: 50, mr: 2 }} />
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              {user.userName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              @{user.accountName}
            </Typography>
          </Box>
        </Box>

        <Button
          variant={
            user.isFollowing || user.hasRequestedFollow
              ? "outlined"
              : "contained"
          }
          sx={{
            textTransform: "none",
            borderRadius: "20px",
            minWidth: "100px",
            bgcolor:
              user.isFollowing || user.hasRequestedFollow
                ? "transparent"
                : "black",
            color:
              user.isFollowing || user.hasRequestedFollow ? "black" : "white",
            border:
              user.isFollowing || user.hasRequestedFollow
                ? "1px solid #ccc"
                : "none",
            "&:hover": {
              bgcolor:
                user.isFollowing || user.hasRequestedFollow
                  ? "#f5f5f5"
                  : "#333",
              border:
                user.isFollowing || user.hasRequestedFollow
                  ? "1px solid #ccc"
                  : "none",
            },
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleFollowToggle(user);
          }}
        >
          {user.isFollowing
            ? "正在追蹤"
            : user.hasRequestedFollow
              ? "已送出請求"
              : "追蹤"}
        </Button>
      </Box>
    );
  };

  // 處理搜尋
  const handleSearch = async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");

      // 根據當前標籤決定搜尋類型
      const endpoint = activeTab === 0 ? "posts" : "users";

      const response = await axios.get<SearchResults>(
        `/api/search/${endpoint}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            q: query,
            limit: 10,
          },
        },
      );

      setSearchResults(response.data);
    } catch (error) {
      console.error("搜尋失敗", error);
      setError("搜尋時發生錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim() && !loading) {
      handleSearch();
    }
  };

  // 處理按讚
  const handleToggleLike = async (postId: string, isLiked: boolean) => {
    try {
      const token = localStorage.getItem("token");
      const method = isLiked ? "DELETE" : "POST";

      await axios({
        method,
        url: `/api/post/${postId}/like`,
        headers: { Authorization: `Bearer ${token}` },
      });

      // 更新本地狀態
      setSearchResults((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          posts: prev.posts.map((post) =>
            post.postId === postId
              ? {
                  ...post,
                  likesCount: isLiked
                    ? post.likesCount - 1
                    : post.likesCount + 1,
                  isLiked: !isLiked,
                }
              : post,
          ),
        };
      });
    } catch (error) {
      console.error("按讚失敗", error);
    }
  };

  return (
    <div className="page">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        padding={2}
      >
        {/* 搜尋欄位 */}
        <Box
          display="flex"
          alignItems="center"
          width="100%"
          maxWidth="500px"
          border={1}
          borderColor="grey.300"
          borderRadius={4}
          padding={1}
          bgcolor="grey.100"
        >
          <IconButton onClick={handleSearch}>
            <SearchIcon color="action" />
          </IconButton>
          <TextField
            variant="standard"
            placeholder="搜尋"
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            InputProps={{
              disableUnderline: true,
            }}
          />
        </Box>

        {/* 分頁標籤 */}
        <Box
          sx={{ borderBottom: 1, borderColor: "divider", width: "100%", mt: 2 }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            centered
          >
            <Tab label="貼文" />
            <Tab label="用戶" />
          </Tabs>
        </Box>

        {/* 載入中狀態 */}
        {loading && (
          <Box display="flex" justifyContent="center" m={4}>
            <CircularProgress />
          </Box>
        )}

        {/* 錯誤訊息 */}
        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}

        {/* 搜尋結果 */}
        {searchResults && !loading && (
          <Box width="100%" mt={2}>
            {activeTab === 0
              ? // 貼文搜尋結果
                searchResults.posts.map((post) => (
                  <Box
                    key={post.postId}
                    sx={{
                      padding: 2,
                      borderBottom: "1px solid #eee",
                      cursor: "pointer",
                    }}
                    onClick={() => navigate(`/posts/${post.postId}`)}
                  >
                    <Box display="flex" alignItems="center" mb={1}>
                      <Avatar
                        src={post.author.avatarUrl}
                        sx={{ width: 40, height: 40, mr: 1 }}
                      />
                      <Box>
                        <Typography variant="subtitle1">
                          {post.author.userName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          @{post.author.accountName}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography sx={{ mb: 1 }}>{post.content}</Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Box display="flex" alignItems="center">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleLike(post.postId, post.isLiked);
                          }}
                        >
                          {post.isLiked ? (
                            <FavoriteIcon color="error" />
                          ) : (
                            <FavoriteBorderIcon />
                          )}
                        </IconButton>
                        <Typography variant="caption">
                          {post.likesCount}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <IconButton>
                          <ChatBubbleOutlineIcon />
                        </IconButton>
                        <Typography variant="caption">
                          {post.commentCount}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))
              : // 用戶搜尋結果
                searchResults.users.map((user) => (
                  <UserListItem key={user.id} user={user} />
                ))}
          </Box>
        )}
      </Box>
    </div>
  );
};

export default Search;
