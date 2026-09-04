"use client";
import { useState } from "react";

type Order = {
  id: number;
  title: string;
  description: string;
  price: number;
};

type OrderModalProps = {
  onAdd: (orderData: Order) => void;
};

export default function OrderModal({ onAdd }: OrderModalProps) {
  const [orderTitle, setOrderTitle] = useState("");
  const [orderDescription, setOrderDescription] = useState("");
  const [orderPrice, setOrderPrice] = useState(0);

  //   Inputs handlers
  function handleOrderTitle(event: React.ChangeEvent<HTMLInputElement>) {
    setOrderTitle(event.target.value);
  }

  function handleOrderDescription(event: React.ChangeEvent<HTMLInputElement>) {
    setOrderDescription(event.target.value);
  }

  function handleOrderPrice(event: React.ChangeEvent<HTMLInputElement>) {
    setOrderPrice(parseFloat(event.target.value));
  }

  function handleAddOrder() {
    const newOrder: Order = {
      id: Date.now(),
      title: orderTitle,
      description: orderDescription,
      price: orderPrice,
    };
    onAdd(newOrder);
  }

  return (
    <div>
      <h2>Order Modal</h2>
      <p>{orderTitle}</p>
      <p>{orderDescription}</p>
      <p>${orderPrice.toFixed(2)}</p>
      <input
        type="text"
        placeholder="Order Title"
        value={orderTitle}
        onChange={handleOrderTitle}
      />
      <input
        type="text"
        placeholder="Order Description"
        value={orderDescription}
        onChange={handleOrderDescription}
      />
      <input
        type="number"
        placeholder="Order Price"
        value={orderPrice}
        onChange={handleOrderPrice}
      />
      <button
        className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600"
        onClick={handleAddOrder}
      >
        Add Order
      </button>
    </div>
  );
}
