"use client";
import { useState } from "react";
import Image from "next/image";
import orderList from "../data/product.json";
import OrderCard from "./components/OrderCard";
import OrderModal from "./components/OrderModal";

type Order = {
  id: number;
  title: string;
  description: string;
  price: number;
};

export default function Home() {
  const [orders, setOrders] = useState(orderList);
  const [isOrderModalOpen, setIsOpenModalOpen] = useState(false);

  function toggleOrderModal() {
    setIsOpenModalOpen(!isOrderModalOpen);
  }

  function newOrder(newOrder: Order) {
    setOrders([...orders, newOrder]);
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans ">
      <header className="flex items-center justify-between w-full py-4 bg-zinc-900">
        <div className="flex justify-between items-center gap-4 w-full max-w-3xl px-6 mx-auto ">
          <Image
            src="/vercel.svg"
            alt="Vercel Logo"
            width={32}
            height={32}
            priority
          />
          <h1 className="text-2xl font-bold text-black dark:text-white">
            Shopik
          </h1>
          <button className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600">
            Sign In
          </button>
        </div>
      </header>

      <main className="flex flex-1 w-full max-w-3xl flex-col gap-4 items-center justify-between py-10 px-6 bg-white sm:items-start">
        {/* Product Cards */}
        {orders.map((order: Order) => (
          <OrderCard key={order.id} product={order} />
        ))}

        {isOrderModalOpen && <OrderModal onAdd={newOrder} />}
      </main>

      <footer className="w-full py-4 bg-zinc-900">
        <div className="flex justify-center items-center gap-4 w-full max-w-3xl px-6 mx-auto">
          <button
            className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600"
            onClick={toggleOrderModal}
          >
            New order
          </button>
        </div>
      </footer>
    </div>
  );
}
