"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import styled from "styled-components";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Initialize client state
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Sync with URL params on mount only (not on every change to avoid loops)
  useEffect(() => {
    if (!isClient) return;
    const chatIdFromUrl = searchParams.get('chat');
    if (chatIdFromUrl && chatIdFromUrl !== selectedChatId) {
      setSelectedChatId(chatIdFromUrl);
    }
  }, [isClient]); // Only run once when client is ready

  // Update URL when selectedChatId changes
  useEffect(() => {
    if (!isClient) return;
    
    const currentChatId = searchParams.get('chat');
    if (selectedChatId && selectedChatId !== currentChatId) {
      // Update URL without navigation
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('chat', selectedChatId);
      window.history.replaceState({}, '', newUrl.toString());
    } else if (!selectedChatId && currentChatId) {
      // Remove chat param from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('chat');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [selectedChatId, isClient, searchParams]);

  const handleBack = () => {
    setSelectedChatId(null);
    // Also update URL
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('chat');
    window.history.replaceState({}, '', newUrl.toString());
  };

  const handleChatSelect = (chatId: string | null) => {
    setSelectedChatId(chatId);
    // Update URL
    const newUrl = new URL(window.location.href);
    if (chatId) {
      newUrl.searchParams.set('chat', chatId);
    } else {
      newUrl.searchParams.delete('chat');
    }
    window.history.replaceState({}, '', newUrl.toString());
  };

  // Prevent any navigation attempts on chat items (but allow click handlers to work)
  useEffect(() => {
    if (!isClient) return;

    const handleClick = (e: MouseEvent) => {
      // Only prevent if it's a link or has href attribute
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]');
      const chatItem = target.closest('[data-chat-id]');
      
      // Only prevent navigation for actual links, not our chat items
      if (link && link.getAttribute('href') && link.getAttribute('href') !== '#') {
        const chatItemParent = link.closest('[data-chat-id]');
        if (chatItemParent && chatItemParent.getAttribute('data-no-navigate') === 'true') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };

    // Also prevent any form submissions that might cause navigation
    const handleSubmit = (e: Event) => {
      const target = e.target as HTMLElement;
      const form = target.closest('form');
      if (form && form.getAttribute('data-no-navigate') === 'true') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // Use bubble phase instead of capture to let component handlers run first
    document.addEventListener('click', handleClick, false);
    document.addEventListener('submit', handleSubmit, false);
    
    return () => {
      document.removeEventListener('click', handleClick, false);
      document.removeEventListener('submit', handleSubmit, false);
    };
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
      <Sidebar selectedChatId={selectedChatId} setSelectedChatId={handleChatSelect} />
      <Chat chatId={selectedChatId} onBack={handleBack} />
    </Container>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <Container>
        <div>Loading...</div>
      </Container>
    }>
      <HomeContent />
    </Suspense>
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
