"use client";
import styled from "styled-components";
import { Avatar, Tooltip, Menu, MenuItem, Divider } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import PersonIcon from "@mui/icons-material/Person";
import { db, auth } from "../../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy, doc, setDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { createOrUpdateUser, updateUserLogout } from "../utils/userUtils";

function Sidebar({ selectedChatId, setSelectedChatId }) {
    const [user, loading, error] = useAuthState(auth);
    const router = useRouter();
    const [chats, setChats] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [anchorEl, setAnchorEl] = useState(null);
    const [recipientUsers, setRecipientUsers] = useState({}); // Map of email -> user data
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

        // Normalize email to lowercase for query
        const normalizedEmail = user.email?.toLowerCase();
        if (!normalizedEmail) return;

        // Helper function to get recipient email from a chat
        const getRecipientEmailFromChat = (chat) => {
            const normalizedUserEmail = user.email?.toLowerCase();
            return chat.users?.find(email => email?.toLowerCase() !== normalizedUserEmail) || chat.users?.[0] || "";
        };

        const q = query(
            collection(db, "chats"),
            where("users", "array-contains", normalizedEmail)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const chatsData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            
            console.log("📋 Chats loaded for user:", normalizedEmail, "Count:", chatsData.length);
            chatsData.forEach((chat, idx) => {
                console.log(`Chat ${idx + 1}:`, {
                    id: chat.id,
                    users: chat.users,
                    lastMessage: chat.lastMessage?.substring(0, 30)
                });
            });
            
            // Sort by timestamp (newest first), or by creation if no timestamp
            chatsData.sort((a, b) => {
                try {
                    const timeA = a.timestamp?.toDate?.() || new Date(0);
                    const timeB = b.timestamp?.toDate?.() || new Date(0);
                    return timeB.getTime() - timeA.getTime();
                } catch (error) {
                    return 0;
                }
            });
            setChats(chatsData);
            
            // Fetch user data for all recipients
            const recipientEmails = new Set();
            chatsData.forEach(chat => {
                const recipientEmail = getRecipientEmailFromChat(chat);
                if (recipientEmail) {
                    recipientEmails.add(recipientEmail.toLowerCase());
                }
            });
            
            // Fetch user data for recipients
            if (recipientEmails.size > 0) {
                const usersRef = collection(db, "users");
                const usersQuery = query(usersRef, where("email", "in", Array.from(recipientEmails)));
                
                try {
                    const usersSnapshot = await getDocs(usersQuery);
                    const usersMap = {};
                    usersSnapshot.forEach((userDoc) => {
                        const userData = userDoc.data();
                        if (userData.email) {
                            usersMap[userData.email.toLowerCase()] = {
                                photoURL: userData.photoURL,
                                displayName: userData.displayName,
                                email: userData.email
                            };
                        }
                    });
                    console.log("✅ Fetched user data for recipients:", usersMap);
                    setRecipientUsers(usersMap);
                } catch (error) {
                    console.error("Error fetching recipient user data:", error);
                    // If "in" query fails (more than 10 items), fetch individually
                    if (error.code === 'invalid-argument' && recipientEmails.size > 10) {
                        console.log("Too many recipients, fetching individually...");
                        const usersMap = {};
                        for (const email of recipientEmails) {
                            try {
                                const userQuery = query(usersRef, where("email", "==", email));
                                const userSnapshot = await getDocs(userQuery);
                                if (!userSnapshot.empty) {
                                    const userData = userSnapshot.docs[0].data();
                                    usersMap[email] = {
                                        photoURL: userData.photoURL,
                                        displayName: userData.displayName,
                                        email: userData.email
                                    };
                                }
                            } catch (err) {
                                console.error(`Error fetching user ${email}:`, err);
                            }
                        }
                        setRecipientUsers(usersMap);
                    }
                }
            }
        }, (error) => {
            console.error("❌ Error listening to chats:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
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

        // Normalize emails to lowercase for consistent comparison
        const normalizedUserEmail = user.email?.toLowerCase();
        const normalizedEmail = email.toLowerCase();

        // First, check local state for existing chat
        const existingChatLocal = chats.find(chat => {
            const chatUsers = chat.users?.map(u => u?.toLowerCase()) || [];
            return chatUsers.includes(normalizedEmail) && chatUsers.includes(normalizedUserEmail);
        });

        if (existingChatLocal) {
            console.log("✅ Found existing chat in local state:", existingChatLocal.id);
            setSelectedChatId(existingChatLocal.id);
            return;
        }

        // Query Firestore to check if chat already exists between these two users
        try {
            console.log("🔍 Checking Firestore for existing chat between:", normalizedUserEmail, "and", normalizedEmail);
            
            // Query for chats where both users are in the users array
            const chatsRef = collection(db, "chats");
            const q = query(
                chatsRef,
                where("users", "array-contains", normalizedUserEmail)
            );
            
            const querySnapshot = await getDocs(q);
            let existingChat = null;
            
            querySnapshot.forEach((docSnapshot) => {
                const chatData = docSnapshot.data();
                const chatUsers = chatData.users?.map(u => u?.toLowerCase()) || [];
                
                // Check if both users are in this chat
                if (chatUsers.includes(normalizedEmail) && chatUsers.includes(normalizedUserEmail)) {
                    existingChat = {
                        id: docSnapshot.id,
                        ...chatData
                    };
                }
            });

            if (existingChat) {
                console.log("✅ Found existing chat in Firestore:", existingChat.id);
                console.log("Chat users:", existingChat.users);
                
                // Ensure both users are in the users array (in case it's missing one)
                const chatUsers = existingChat.users?.map(u => u?.toLowerCase()) || [];
                const hasBothUsers = chatUsers.includes(normalizedUserEmail) && chatUsers.includes(normalizedEmail);
                
                if (!hasBothUsers) {
                    console.log("⚠️ Chat exists but missing a user, updating...");
                    const updatedUsers = [...new Set([...chatUsers, normalizedUserEmail, normalizedEmail])].sort();
                    await setDoc(doc(db, "chats", existingChat.id), {
                        users: updatedUsers
                    }, { merge: true });
                    console.log("✅ Updated chat users array:", updatedUsers);
                }
                
                setSelectedChatId(existingChat.id);
                return;
            }

            // No existing chat found, create a new one
            console.log("📝 No existing chat found, creating new chat...");
            const chatUsers = [normalizedUserEmail, normalizedEmail].sort();
            
            const newChat = await addDoc(collection(db, "chats"), {
                users: chatUsers,
                timestamp: serverTimestamp(),
                lastMessage: "",
            });
            console.log("✅ Chat created successfully:", newChat.id);
            console.log("Chat users:", chatUsers);
            setSelectedChatId(newChat.id);
        } catch (error) {
            console.error("❌ Error creating/checking chat:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            alert("Error creating chat. Please try again.");
        }
    };

    const getRecipientEmail = (chat) => {
        const normalizedUserEmail = user.email?.toLowerCase();
        return chat.users?.find(email => email?.toLowerCase() !== normalizedUserEmail) || chat.users?.[0] || "";
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
                        const normalizedRecipientEmail = recipientEmail?.toLowerCase();
                        const recipientUser = recipientUsers[normalizedRecipientEmail];
                        const lastMessage = chat.lastMessage || "";
                        const handleChatClick = (e) => {
                            // Aggressively prevent all default behaviors for all browsers
                            if (!e || !isMountedRef.current) {
                                return false;
                            }
                            
                            // Prevent default and stop all propagation
                            try {
                                if (typeof e.preventDefault === 'function') {
                                    e.preventDefault();
                                }
                                if (typeof e.stopPropagation === 'function') {
                                    e.stopPropagation();
                                }
                                if (typeof e.stopImmediatePropagation === 'function') {
                                    e.stopImmediatePropagation();
                                }
                                
                                // Prevent any navigation or window opening
                                if (e.target) {
                                    if (e.target.href) {
                                        e.target.href = 'javascript:void(0)';
                                    }
                                    if (e.target.onclick) {
                                        e.target.onclick = null;
                                    }
                                    // Remove any link attributes
                                    if (e.target.removeAttribute) {
                                        e.target.removeAttribute('href');
                                    }
                                }
                                
                                // Prevent from treating this as a link
                                if (e.currentTarget) {
                                    if (e.currentTarget.href) {
                                        e.currentTarget.href = undefined;
                                    }
                                    if (e.currentTarget.onclick) {
                                        e.currentTarget.onclick = null;
                                    }
                                    // Remove any link attributes
                                    if (e.currentTarget.removeAttribute) {
                                        e.currentTarget.removeAttribute('href');
                                    }
                                }
                                
                                // Prevent browser navigation - double check
                                if (!e.defaultPrevented && typeof e.preventDefault === 'function') {
                                    e.preventDefault();
                                }
                            } catch (error) {
                                console.error('Error in handleChatClick:', error);
                            }
                            
                            // Set the selected chat immediately - use functional update for safety
                            if (isMountedRef.current) {
                                setSelectedChatId((prevId) => {
                                    // Only update if different to avoid unnecessary re-renders
                                    return prevId !== chat.id ? chat.id : prevId;
                                });
                            }
                            
                            // Return false as additional safeguard
                            return false;
                        };

                        return (
                            <Tooltip 
                                key={chat.id}
                                title={`Click to open chat with ${recipientEmail}`}
                                arrow
                                disableHoverListener={false}
                                disableFocusListener={true}
                                disableTouchListener={true}
                            >
                                <ChatItem
                                    onClick={handleChatClick}
                                    data-chat-id={chat.id}
                                    data-no-navigate="true"
                                    onMouseDown={(e) => {
                                        // Prevent all non-left clicks and default behaviors
                                        if (e && e.button !== 0) {
                                            if (typeof e.preventDefault === 'function') {
                                                e.preventDefault();
                                            }
                                            if (typeof e.stopPropagation === 'function') {
                                                e.stopPropagation();
                                            }
                                            if (typeof e.stopImmediatePropagation === 'function') {
                                                e.stopImmediatePropagation();
                                            }
                                            return false;
                                        }
                                        // Also prevent default for left click to be safe
                                        if (e && typeof e.preventDefault === 'function') {
                                            e.preventDefault();
                                        }
                                    }}
                                    onTouchStart={(e) => {
                                        // Prevent Safari touch events from causing navigation
                                        if (e) {
                                            if (typeof e.preventDefault === 'function') {
                                                e.preventDefault();
                                            }
                                            if (typeof e.stopPropagation === 'function') {
                                                e.stopPropagation();
                                            }
                                        }
                                    }}
                                    onTouchEnd={(e) => {
                                        // Handle touch end for mobile Safari
                                        if (e) {
                                            if (typeof e.preventDefault === 'function') {
                                                e.preventDefault();
                                            }
                                            if (typeof e.stopPropagation === 'function') {
                                                e.stopPropagation();
                                            }
                                        }
                                        setSelectedChatId(chat.id);
                                    }}
                                    onContextMenu={(e) => {
                                        // Prevent right-click context menu
                                        if (e) {
                                            if (typeof e.preventDefault === 'function') {
                                                e.preventDefault();
                                            }
                                            if (typeof e.stopPropagation === 'function') {
                                                e.stopPropagation();
                                            }
                                        }
                                        return false;
                                    }}
                                    $isSelected={selectedChatId === chat.id}
                                    role="button"
                                    aria-label={`Open chat with ${recipientEmail}`}
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e && (e.key === 'Enter' || e.key === ' ')) {
                                            if (typeof e.preventDefault === 'function') {
                                                e.preventDefault();
                                            }
                                            if (typeof e.stopPropagation === 'function') {
                                                e.stopPropagation();
                                            }
                                            setSelectedChatId(chat.id);
                                        }
                                    }}
                                >
                                    <ChatAvatar>
                                        {recipientUser?.photoURL ? (
                                            <AvatarImage src={recipientUser.photoURL} alt={recipientUser.displayName || recipientEmail} />
                                        ) : (
                                            recipientEmail[0]?.toUpperCase()
                                        )}
                                    </ChatAvatar>
                                    <ChatInfo>
                                        <ChatName>{recipientUser?.displayName || recipientEmail}</ChatName>
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
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    touch-action: manipulation;
    
    /* Prevent all browsers from treating this as a link */
    text-decoration: none !important;
    color: inherit;
    
    /* Explicitly prevent link behavior */
    pointer-events: auto;
    
    &:hover {
        background-color: ${props => props.$isSelected ? "#e5f5f0" : "#f5f5f5"};
    }
    
    &:focus {
        outline: 2px solid #007a5a;
        outline-offset: -2px;
    }
    
    &:active {
        background-color: ${props => props.$isSelected ? "#d4ede5" : "#e8e8e8"};
    }
    
    /* Prevent any link-like behavior in all browsers */
    &[href] {
        pointer-events: none;
    }
    
    /* Prevent Edge from treating as navigation */
    &[data-no-navigate="true"] {
        -ms-touch-action: manipulation;
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
    overflow: hidden;
    position: relative;
`;

const AvatarImage = styled.img`
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
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
