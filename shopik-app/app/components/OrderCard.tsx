type Product = {
  id: number;
  title: string;
  description: string;
  price: number;
};

type ProductCardProps = {
  product: Product;
};

export default function OrderCard({ product }: ProductCardProps) {
  return (
    <div className="flex flex-row items-center justify-between w-full gap-4 bg-zinc-300 p-6 rounded-lg shadow-md sm:items-start">
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xl font-bold text-black dark:text-white">
            {product.title}
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            {product.description}
          </p>
        </div>

        <p className="text-gray-600 dark:text-gray-400">
          ${product.price.toFixed(2)}
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
  );
}
