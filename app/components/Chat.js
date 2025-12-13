"use client";
import styled from "styled-components";
import SendIcon from "@mui/icons-material/Send";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { db, auth } from "../../firebase";
import { collection, addDoc, query, onSnapshot, orderBy, serverTimestamp, updateDoc, doc, getDoc, where, getDocs } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useState, useEffect, useRef } from "react";

function Chat({ chatId, onBack }) {
    const [user] = useAuthState(auth);
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [chatData, setChatData] = useState(null);
    const [recipientUserData, setRecipientUserData] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!chatId || !user) {
            console.log("Chat effect skipped - chatId:", chatId, "user:", user?.email);
            return;
        }

        console.log("Setting up chat listeners for chatId:", chatId, "user:", user.email);

        // Get chat data
        const chatRef = doc(db, "chats", chatId);
        const unsubscribeChat = onSnapshot(chatRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = { id: snapshot.id, ...snapshot.data() };
                console.log("✅ Chat data loaded:", data);
                console.log("Chat users:", data.users);
                setChatData(data);
            } else {
                console.error("❌ Chat document does not exist:", chatId);
            }
        }, (error) => {
            console.error("❌ Error listening to chat:", error);
        });

        // Get messages - use simple query and sort client-side to avoid index issues
        const messagesRef = collection(db, "chats", chatId, "messages");
        console.log("Setting up messages listener for chat:", chatId);
        
        const unsubscribeMessages = onSnapshot(
            messagesRef,
            (snapshot) => {
                console.log("📨 Snapshot received, document count:", snapshot.docs.length);
                
                const messagesData = snapshot.docs.map((docSnapshot) => {
                    const data = docSnapshot.data();
                    const message = {
                        id: docSnapshot.id,
                        text: data.text || "",
                        sender: data.sender || "",
                        timestamp: data.timestamp || null,
                    };
                    console.log("📝 Message from doc:", {
                        id: message.id,
                        text: message.text,
                        sender: message.sender,
                        hasTimestamp: !!message.timestamp
                    });
                    return message;
                });
                
                // Sort client-side by timestamp
                messagesData.sort((a, b) => {
                    try {
                        const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : (a.timestamp ? new Date(a.timestamp) : new Date(0));
                        const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : (b.timestamp ? new Date(b.timestamp) : new Date(0));
                        return timeA.getTime() - timeB.getTime();
                    } catch (error) {
                        console.error("Error sorting messages:", error);
                        return 0;
                    }
                });
                
                console.log("✅ Total messages after processing:", messagesData.length);
                console.log("Current user:", user.email);
                messagesData.forEach((msg, idx) => {
                    const isOwn = msg.sender?.toLowerCase() === user.email?.toLowerCase();
                    console.log(`Message ${idx + 1}:`, {
                        text: msg.text?.substring(0, 50),
                        sender: msg.sender,
                        isOwn: isOwn,
                        willDisplay: true
                    });
                });
                
                setMessages(messagesData);
            },
            (error) => {
                console.error("❌ Error listening to messages:", error);
                console.error("Error code:", error.code);
                console.error("Error message:", error.message);
                console.error("Error stack:", error.stack);
                // Set empty array on error to prevent stale data
                setMessages([]);
            }
        );

        return () => {
            unsubscribeChat();
            unsubscribeMessages();
        };
    }, [chatId, user]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const validateMessage = (message) => {
        const trimmed = message.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: "Message cannot be empty" };
        }
        if (trimmed.length > 1000) {
            return { valid: false, error: "Message cannot exceed 1000 characters" };
        }
        return { valid: true };
    };

    const sendMessage = async (e) => {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        
        if (!user || !chatId || !chatData) return;

        const validation = validateMessage(inputMessage);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        const messageText = inputMessage.trim();
        const normalizedSenderEmail = user.email?.toLowerCase();

        try {
            // Ensure chat has both users in the users array
            const recipientEmail = getRecipientEmail();
            const normalizedRecipientEmail = recipientEmail?.toLowerCase();
            
            if (normalizedRecipientEmail && chatData.users) {
                const chatUsers = chatData.users.map(u => u?.toLowerCase());
                const hasBothUsers = chatUsers.includes(normalizedSenderEmail) && 
                                     chatUsers.includes(normalizedRecipientEmail);
                
                if (!hasBothUsers) {
                    // Update chat to include both users
                    const updatedUsers = [...new Set([
                        ...chatData.users.map(u => u?.toLowerCase()),
                        normalizedSenderEmail,
                        normalizedRecipientEmail
                    ])];
                    
                    await updateDoc(doc(db, "chats", chatId), {
                        users: updatedUsers,
                    });
                    console.log("Updated chat users array:", updatedUsers);
                }
            }
            
            // Add message to subcollection
            await addDoc(collection(db, "chats", chatId, "messages"), {
                text: messageText,
                sender: normalizedSenderEmail,
                timestamp: serverTimestamp(),
            });

            // Update chat's last message and timestamp
            await updateDoc(doc(db, "chats", chatId), {
                lastMessage: messageText,
                timestamp: serverTimestamp(),
            });

            console.log("✅ Message sent successfully");
            setInputMessage("");
            inputRef.current?.focus();
        } catch (error) {
            console.error("❌ Error sending message:", error);
            console.error("Error details:", {
                code: error.code,
                message: error.message,
                chatId: chatId,
                user: user.email
            });
            alert("Error sending message. Please try again.");
        }
    };

    const getRecipientEmail = () => {
        if (!chatData || !user) return "";
        const normalizedUserEmail = user.email?.toLowerCase();
        return chatData.users?.find(email => email?.toLowerCase() !== normalizedUserEmail) || chatData.users?.[0] || "";
    };

    // Fetch recipient user data from users collection
    useEffect(() => {
        if (!chatData || !user) return;

        const recipientEmail = getRecipientEmail();
        if (!recipientEmail) return;

        const fetchRecipientUser = async () => {
            try {
                // Query users collection by email
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("email", "==", recipientEmail));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    const userDoc = querySnapshot.docs[0];
                    setRecipientUserData({
                        id: userDoc.id,
                        ...userDoc.data()
                    });
                } else {
                    // User document doesn't exist yet
                    setRecipientUserData(null);
                }
            } catch (error) {
                console.error("Error fetching recipient user data:", error);
                setRecipientUserData(null);
            }
        };

        fetchRecipientUser();
    }, [chatData, user]);

    const formatLastSeen = (timestamp) => {
        if (!timestamp) return "Never";
        
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) {
                return "Last seen just now";
            } else if (diffMins < 60) {
                return `Last seen ${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
            } else if (diffHours < 24) {
                return `Last seen ${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            } else if (diffDays < 7) {
                return `Last seen ${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            } else {
                return `Last seen ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }
        } catch (error) {
            console.error("Error formatting last seen:", error);
            return "Last seen unknown";
        }
    };

    if (!chatId) {
        return (
            <EmptyChatContainer>
                <EmptyChatMessage>
                    Select a chat to start messaging
                </EmptyChatMessage>
            </EmptyChatContainer>
        );
    }

    if (!chatData) {
        return (
            <EmptyChatContainer>
                <EmptyChatMessage>Loading chat...</EmptyChatMessage>
            </EmptyChatContainer>
        );
    }

    const recipientEmail = getRecipientEmail();

    const handleBack = (e) => {
        if (e) {
            if (typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }
        }
        if (onBack) {
            onBack();
        } else if (typeof window !== 'undefined') {
            // Fallback: try to go back in browser history or close window
            if (window.history.length > 1) {
                window.history.back();
            } else if (window.opener) {
                // If opened in a new window, try to close it
                window.close();
            }
        }
    };

    return (
        <Container>
            <Header>
                <HeaderLeft>
                    {onBack && (
                        <BackButton 
                            onClick={handleBack}
                            title="Go back to chat list"
                            aria-label="Go back to chat list"
                        >
                            <ArrowBackIcon />
                        </BackButton>
                    )}
                    <ChatAvatar>
                        {recipientEmail[0]?.toUpperCase()}
                    </ChatAvatar>
                    <ChatInfo>
                        <ChatName>{recipientEmail}</ChatName>
                        <ChatStatus>
                            {recipientUserData?.lastLogin 
                                ? formatLastSeen(recipientUserData.lastLogin)
                                : "Last seen unknown"
                            }
                        </ChatStatus>
                    </ChatInfo>
                </HeaderLeft>
                <HeaderRight>
                    <IconButton title="Attach file">
                        <AttachFileIcon />
                    </IconButton>
                    <IconButton title="More options">
                        <MoreVertIcon />
                    </IconButton>
                </HeaderRight>
            </Header>
            <MessagesContainer>
                {messages.length === 0 ? (
                    <NoMessages>No messages yet. Start the conversation!</NoMessages>
                ) : (
                    messages.map((message) => {
                        // Case-insensitive comparison for sender
                        const normalizedUserEmail = user.email?.toLowerCase();
                        const normalizedSender = message.sender?.toLowerCase();
                        const isOwnMessage = normalizedSender === normalizedUserEmail;
                        return (
                            <MessageWrapper key={message.id} $isOwn={isOwnMessage}>
                                <Message $isOwn={isOwnMessage}>
                                    {message.text}
                                    <MessageTime>
                                        {message.timestamp?.toDate()?.toLocaleTimeString([], { 
                                            hour: '2-digit', 
                                            minute: '2-digit' 
                                        }) || ""}
                                    </MessageTime>
                                </Message>
                            </MessageWrapper>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </MessagesContainer>
            <InputContainer onSubmit={sendMessage}>
                <InputWrapper>
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="Type a message"
                        value={inputMessage}
                        onChange={(e) => {
                            const value = e.target.value;
                            if (value.length <= 1000) {
                                setInputMessage(value);
                            }
                        }}
                        onKeyPress={(e) => {
                            if (e && e.key === "Enter" && !e.shiftKey) {
                                if (typeof e.preventDefault === 'function') {
                                    e.preventDefault();
                                }
                                sendMessage(e);
                            }
                        }}
                    />
                    <SendButton type="submit" disabled={!inputMessage.trim()}>
                        <SendIcon />
                    </SendButton>
                </InputWrapper>
            </InputContainer>
        </Container>
    );
}

export default Chat;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    max-width: 100%;
    background-color: #e5ddd5;
    background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='a' patternUnits='userSpaceOnUse' width='100' height='100' patternTransform='scale(0.5) rotate(0)'%3E%3Crect id='b' width='200' height='200' fill='hsla(0,0%25,100%25,0)'/%3E%3Cpath d='M100 100h50v50h-50z' fill='hsla(0,0%25,0%25,0.02)'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill='url(%23a)' height='100%25' width='100%25'/%3E%3C/svg%3E");
    flex: 1;
    overflow: hidden;
`;

const EmptyChatContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-color: #e5ddd5;
    flex: 1;
`;

const EmptyChatMessage = styled.div`
    color: #999;
    font-size: 18px;
    text-align: center;
    padding: 40px;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background-color: #ededed;
    border-left: 1px solid #e0e0e0;
    height: 60px;
`;

const HeaderLeft = styled.div`
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 10px;
`;

const BackButton = styled.button`
    background-color: transparent;
    border: none;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #54656f;
    margin-right: 5px;
    transition: background-color 0.2s;
    
    &:hover {
        background-color: #e0e0e0;
    }
    
    &:active {
        background-color: #d0d0d0;
    }
    
    svg {
        font-size: 24px;
    }
    
    /* Prevent Safari from treating this as a link */
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    touch-action: manipulation;
`;

const HeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const ChatAvatar = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: #007a5a;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 16px;
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
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ChatStatus = styled.div`
    font-size: 13px;
    color: #666;
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

const MessagesContainer = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const MessageWrapper = styled.div`
    display: flex;
    justify-content: ${props => props.$isOwn ? "flex-end" : "flex-start"};
    width: 100%;
`;

const Message = styled.div`
    max-width: 65%;
    padding: 8px 12px;
    border-radius: 8px;
    background-color: ${props => props.$isOwn ? "#dcf8c6" : "white"};
    color: #000;
    font-size: 14px;
    word-wrap: break-word;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const MessageTime = styled.span`
    font-size: 11px;
    color: #999;
    align-self: flex-end;
    margin-top: 2px;
`;

const InputContainer = styled.form`
    padding: 10px;
    background-color: #f0f0f0;
    border-top: 1px solid #e0e0e0;
    border-left: 1px solid #e0e0e0;
`;

const InputWrapper = styled.div`
    display: flex;
    align-items: center;
    background-color: white;
    border-radius: 25px;
    padding: 5px 10px;
    gap: 10px;
`;

const Input = styled.input`
    flex: 1;
    border: none;
    outline: none;
    padding: 8px 12px;
    font-size: 15px;
    background-color: transparent;
    
    &::placeholder {
        color: #999;
    }
`;

const SendButton = styled.button`
    background-color: #007a5a;
    color: white;
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s;
    
    &:hover:not(:disabled) {
        background-color: #005f45;
    }
    
    &:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
    
    svg {
        font-size: 18px;
    }
`;

const NoMessages = styled.div`
    text-align: center;
    color: #999;
    font-size: 14px;
    margin-top: 40px;
`;

