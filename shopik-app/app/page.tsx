import Image from "next/image";

type Product = {
  id: number;
  title: string;
  description: string;
  price: number;
}

export default function Home() {
return (
  <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans ">
    <header className="flex items-center justify-between w-full py-4 bg-zinc-900" >
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

    <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-10 px-6 bg-white sm:items-start">
      <div className="flex flex-row items-center justify-between w-full gap-4 bg-zinc-200 p-6 rounded-lg shadow-md sm:items-start">
        <div>
          <p className="text-xl font-bold text-black dark:text-white">
            Order your favorite products with ease
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            Here are the details of your order.
          </p>
        </div>

        <div className="flex flex-row gap-2">
          <button className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600">
            Continue Shopping
          </button>
          <button className="px-4 py-2 text-white bg-red-500 rounded hover:bg-red-600">
            X
          </button>
        </div>
      </div>
    </main>

    <footer className="w-full py-4 bg-zinc-900">
      <div className="flex justify-center items-center gap-4 w-full max-w-3xl px-6 mx-auto">
        <button className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600">
          New order
        </button>
      </div>
    </footer>
  </div>
);
}
