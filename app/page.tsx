"use client";
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import styled from "styled-components";

export default function Home() {
  const [selectedChatId, setSelectedChatId] = useState(null);

  const handleBack = () => {
    setSelectedChatId(null);
  };

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
  overflow: hidden;
`;
