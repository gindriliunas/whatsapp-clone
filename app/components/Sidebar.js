"use client";
import styled from "styled-components";
import { Avatar, Tooltip, Menu, MenuItem, Divider } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import PersonIcon from "@mui/icons-material/Person";
import { db, auth } from "../../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { createOrUpdateUser, updateUserLogout } from "../utils/userUtils";

function Sidebar({ selectedChatId, setSelectedChatId }) {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const [chats, setChats] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/log-in");
        }
    }, [user, loading, router]);

    // Ensure user document exists in Firestore when user is loaded
    useEffect(() => {
        if (user && !loading) {
            createOrUpdateUser(user).catch((error) => {
                console.error("Failed to create/update user document:", error);
            });
        }
    }, [user, loading]);

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "chats"),
            where("users", "array-contains", user.email)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chatsData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            // Sort by timestamp (newest first), or by creation if no timestamp
            chatsData.sort((a, b) => {
                const timeA = a.timestamp?.toDate?.() || new Date(0);
                const timeB = b.timestamp?.toDate?.() || new Date(0);
                return timeB - timeA;
            });
            setChats(chatsData);
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) return <LoadingContainer>Loading...</LoadingContainer>;
    if (error) return <ErrorContainer>Error: {error.message}</ErrorContainer>;
    if (!user) return null;

    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleAvatarClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = async () => {
        handleMenuClose();
        
        // Update user document with logout time (don't block logout if this fails)
        if (user) {
            try {
                await updateUserLogout(user);
            } catch (error) {
                console.error("Error updating user logout time:", error);
                // Continue with logout even if document update fails
            }
        }
        
        // Always attempt to sign out and redirect
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out:", error);
            // Even if signOut fails, redirect to login page
        } finally {
            // Always redirect to login page
            router.push("/log-in");
        }
    };

    const createChat = async () => {
        if (!user) {
            router.push("/log-in");
            return;
        }
        const input = prompt("Please enter the email of the user you want to chat with");
        
        if (!input) {
            return;
        }

        const email = input.trim();

        if (!validateEmail(email)) {
            alert("Please enter a valid email address");
            return;
        }

        if (email.toLowerCase() === user.email?.toLowerCase()) {
            alert("You cannot start a chat with yourself");
            return;
        }

        // Check if chat already exists
        const existingChat = chats.find(chat => 
            chat.users.includes(email) && chat.users.includes(user.email)
        );

        if (existingChat) {
            setSelectedChatId(existingChat.id);
            return;
        }

        try {
            const newChat = await addDoc(collection(db, "chats"), {
                users: [user.email, email],
                timestamp: new Date(),
            });
            setSelectedChatId(newChat.id);
        } catch (error) {
            console.error("Error creating chat:", error);
            alert("Error creating chat. Please try again.");
        }
    };

    const getRecipientEmail = (chat) => {
        return chat.users.find(email => email !== user.email) || chat.users[0];
    };

    const filteredChats = chats.filter(chat => {
        if (!searchQuery.trim()) return true;
        const recipientEmail = getRecipientEmail(chat);
        return recipientEmail.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <Container>
            <Header>
                <Tooltip title={`Signed in as ${user.email}`} arrow>
                    <UserAvatar 
                        src={user.photoURL} 
                        alt={user.displayName || user.email}
                        onClick={handleAvatarClick}
                        style={{ cursor: 'pointer' }}
                    >
                        {!user.photoURL && (user.displayName?.[0] || user.email?.[0]?.toUpperCase())}
                    </UserAvatar>
                </Tooltip>
                <Menu
                    anchorEl={anchorEl}
                    open={open}
                    onClose={handleMenuClose}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'left',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'left',
                    }}
                >
                    <MenuItem disabled>
                        <PersonIcon style={{ marginRight: 8, fontSize: 20 }} />
                        {user.email}
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={handleLogout}>
                        <ExitToAppIcon style={{ marginRight: 8, fontSize: 20 }} />
                        Sign out
                    </MenuItem>
                </Menu>
                <IconsContainer>
                    <Tooltip title="Start a new chat" arrow>
                        <IconButton onClick={createChat}>
                            <ChatIcon />    
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="More options" arrow>
                        <IconButton>
                            <MoreVertIcon />
                        </IconButton>
                    </Tooltip>
                </IconsContainer>
            </Header>
            <Search>
                <Tooltip title="Search for chats" arrow>
                    <SearchIconWrapper>
                        <SearchIcon />
                    </SearchIconWrapper>
                </Tooltip>
                <SearchInput 
                    placeholder="Search or start new chat" 
                    value={searchQuery}
                    onChange={(e) => {
                        const value = e.target.value;
                        if (value.length <= 100) {
                            setSearchQuery(value);
                        }
                    }}
                />
            </Search>
            <Tooltip title="Click to start a conversation with another user" arrow>
                <SidebaButton onClick={createChat}>
                    Start a new chat
                </SidebaButton>
            </Tooltip>
            <ChatsList>
                {filteredChats.length === 0 ? (
                    <NoChatsMessage>
                        {searchQuery ? "No chats found" : "No chats yet. Start a new chat!"}
                    </NoChatsMessage>
                ) : (
                    filteredChats.map((chat) => {
                        const recipientEmail = getRecipientEmail(chat);
                        const lastMessage = chat.lastMessage || "";
                        return (
                            <Tooltip 
                                key={chat.id}
                                title={`Click to open chat with ${recipientEmail}`}
                                arrow
                            >
                                <ChatItem
                                    onClick={() => setSelectedChatId(chat.id)}
                                    $isSelected={selectedChatId === chat.id}
                                >
                                    <ChatAvatar>
                                        {recipientEmail[0]?.toUpperCase()}
                                    </ChatAvatar>
                                    <ChatInfo>
                                        <ChatName>{recipientEmail}</ChatName>
                                        <LastMessage>{lastMessage || "No messages yet"}</LastMessage>
                                    </ChatInfo>
                                </ChatItem>
                            </Tooltip>
                        );
                    })
                )}
            </ChatsList>
        </Container>
    );
}

export default Sidebar;

const Container = styled.div`
    background-color: #f0f0f0;
    width: 30%;
    min-width: 300px;
    max-width: 400px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #e0e0e0;
`;

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-color: #f0f0f0;
`;

const ErrorContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-color: #f0f0f0;
    color: red;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px;
    background-color: #ededed;
    height: 60px;
    border-bottom: 1px solid #e0e0e0;
`;

const UserAvatar = styled(Avatar)`
    margin: 10px;
    cursor: pointer;
    background-color: #007a5a;
    :hover {
        opacity: 0.8;
    }
`;

const IconsContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    color: #54656f;
    
    svg {
        font-size: 24px;
        cursor: pointer;
        
        &:hover {
            color: #000;
        }
    }
`;

const IconButton = styled.button`
    background-color: transparent;
    border: none;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #54656f;
    &:hover {
        background-color: #e0e0e0;
    }
`;

const Search = styled.div`
    display: flex;
    align-items: center;
    padding: 8px;
    background-color: white;
    border-bottom: 1px solid #e0e0e0;
`;

const SearchIconWrapper = styled.div`
    display: flex;
    align-items: center;
    color: #54656f;
    cursor: help;
`;

const SearchInput = styled.input`  
    padding: 8px 12px;
    border-radius: 20px;
    background-color: #f0f0f0;
    border: none;
    outline: none;
    width: 100%;
    margin-left: 10px;
    font-size: 14px;
    
    &::placeholder {
        color: #999;
    }
    
    &:focus {
        background-color: white;
        box-shadow: 0 0 0 1px #007a5a;
    }
`;

const SidebaButton = styled.button`
    width: 80%;
    display: block;
    margin: 15px auto;
    padding: 12px;
    border-radius: 20px;
    background-color: #007a5a;
    color: white;
    border: none;
    outline: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    :hover {
        background-color: #005f45;
    }
`;

const ChatsList = styled.div`
    flex: 1;
    overflow-y: auto;
    background-color: white;
`;

const ChatItem = styled.div`
    display: flex;
    align-items: center;
    padding: 10px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    background-color: ${props => props.$isSelected ? "#e5f5f0" : "white"};
    
    &:hover {
        background-color: ${props => props.$isSelected ? "#e5f5f0" : "#f5f5f5"};
    }
`;

const ChatAvatar = styled.div`
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: #007a5a;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 18px;
    margin-right: 15px;
    flex-shrink: 0;
`;

const ChatInfo = styled.div`
    flex: 1;
    min-width: 0;
`;

const ChatName = styled.div`
    font-weight: 500;
    font-size: 16px;
    color: #000;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const LastMessage = styled.div`
    font-size: 14px;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const NoChatsMessage = styled.div`
    padding: 40px 20px;
    text-align: center;
    color: #999;
    font-size: 14px;
`;
