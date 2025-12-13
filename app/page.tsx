"use client";
import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import styled from "styled-components";

export default function Home() {
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [isClient, setIsClient] = useState(false);

  // Ensure this only runs on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleBack = () => {
    setSelectedChatId(null);
  };

  // Prevent any navigation attempts
  useEffect(() => {
    const handleClick = (e) => {
      // Check if click is on a chat item
      const chatItem = e.target.closest('[data-chat-id]');
      if (chatItem && chatItem.getAttribute('data-no-navigate') === 'true') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    if (isClient) {
      document.addEventListener('click', handleClick, true);
      return () => {
        document.removeEventListener('click', handleClick, true);
      };
    }
  }, [isClient]);

  if (!isClient) {
    return (
      <Container>
        <div>Loading...</div>
      </Container>
    );
  }

  return (
    <Container>
      <Sidebar selectedChatId={selectedChatId} setSelectedChatId={setSelectedChatId} />
      <Chat chatId={selectedChatId} onBack={handleBack} />
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  height: 100vh;
  width: 100vw;
  max-width: 100vw;
  overflow: hidden;
  position: relative;
  
  /* Prevent any full-screen behavior */
  & > * {
    flex-shrink: 0;
  }
`;
