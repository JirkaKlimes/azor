"use client";
import BulletPoints from "./components/bulletPoints";
import ChatInput from "./components/input";
import Layout from "./components/panel-layout";
import Navbar from "./components/navbar";
import Wall from "./components/wall";

export default function Home() {
  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <Navbar />
      <Layout
        c1={<BulletPoints />}
        c2={
          <div className="flex flex-col">
            <Wall />
            <Wall />
            <Wall />
            <Wall />
          </div>
        }
        c3={
          <div className="relative flex flex-col items-center justify-center h-full w-full overflow-hidden">
            <div className="h-full overflow-y-auto pt-6 px-6 pb-44">
              <Wall />
            </div>
            <ChatInput />
          </div>
        }
      />
    </div>
  );
}
