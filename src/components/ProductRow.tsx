'use client';

import React, { useState, useEffect } from 'react';

export interface Product {
  id: string;
  name: string;
  description: string;
  grade: string;
  wood_type: string;
  thickness_options: string[];
  size_options: string[];
  quality_options?: string[]; // e.g. ['Commercial', 'Alternate', 'Red Core', 'Marine Ply']
  image_url?: string;
}

interface ProductRowProps {
  product: Product;
  onAddToEnquiry: (product: Product, thickness: string, size: string, quantity: number, quality?: string) => void;
}

export default function ProductRow({ product, onAddToEnquiry }: ProductRowProps) {
  const [selectedThickness, setSelectedThickness] = useState(
    product.thickness_options[0] || '12mm'
  );
  const [selectedSize, setSelectedSize] = useState(
    product.size_options[0] || '8x4'
  );

  useEffect(() => {
    if (product.thickness_options && product.thickness_options.length > 0) {
      setSelectedThickness(product.thickness_options[0]);
    }
    if (product.size_options && product.size_options.length > 0) {
      setSelectedSize(product.size_options[0]);
    }
  }, [product]);

  const [quantity, setQuantity] = useState(25); // Default wholesale sheet quantity
  const [isAdded, setIsAdded] = useState(false);

  const handleAdd = () => {
    if (quantity <= 0) return;
    
    // Hardcode/derive the row's quality context directly from the row name
    let quality: string | undefined = undefined;
    const nameLower = product.name.toLowerCase();
    if (nameLower.includes('commercial')) {
      quality = 'Commercial';
    } else if (nameLower.includes('alternate')) {
      quality = 'Alternate';
    } else if (nameLower.includes('red core')) {
      quality = 'Red Core';
    } else if (nameLower.includes('marine')) {
      quality = 'Marine Ply';
    }
    
    onAddToEnquiry(product, selectedThickness, selectedSize, quantity, quality);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1500);
  };

  const incrementQty = () => setQuantity((prev) => prev + 5);
  const decrementQty = () => setQuantity((prev) => Math.max(1, prev - 5));

  const isLaminate = product.grade.toLowerCase() === 'laminate';

  return (
    <div className="flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-4 border-b border-stone-200/60 bg-white hover:bg-stone-50/50 py-3.5 px-4 items-start sm:items-center transition duration-200 text-stone-855 text-xs sm:text-sm font-semibold">
      
      {/* Col 1: Category Name */}
      <div className="sm:col-span-3 flex items-center space-x-2 w-full">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isLaminate ? 'bg-blue-600' : 'bg-amber-700'}`} />
        <span className="font-extrabold text-stone-900 tracking-tight text-sm">
          {product.name}
        </span>
      </div>

      {/* Col 2: Size Dropdown */}
      <div className="sm:col-span-2 flex items-center space-x-1.5 w-full sm:w-auto">
        <span className="sm:hidden text-[10px] font-extrabold text-stone-400 uppercase shrink-0">Size:</span>
        <select
          value={selectedSize}
          onChange={(e) => setSelectedSize(e.target.value)}
          disabled={!product.size_options || product.size_options.length <= 1}
          className="w-full sm:w-24 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-bold text-stone-855 shadow-xs focus:border-amber-800 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
        >
          {(product.size_options || []).map((size) => (
            <option key={size} value={size}>
              {size} ft
            </option>
          ))}
        </select>
      </div>

      {/* Col 3: Thickness Dropdown */}
      <div className="sm:col-span-2 flex items-center space-x-1.5 w-full sm:w-auto">
        <span className="sm:hidden text-[10px] font-extrabold text-stone-400 uppercase shrink-0">Thickness:</span>
        <select
          value={selectedThickness}
          onChange={(e) => setSelectedThickness(e.target.value)}
          disabled={!product.thickness_options || product.thickness_options.length <= 1}
          className="w-full sm:w-24 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-bold text-stone-855 shadow-xs focus:border-amber-800 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
        >
          {(product.thickness_options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {/* Col 4: Quantity Selector */}
      <div className="sm:col-span-2.5 flex items-center space-x-1.5 w-full sm:w-auto">
        <span className="sm:hidden text-[10px] font-extrabold text-stone-400 uppercase shrink-0">Sheets:</span>
        <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5 shadow-xs w-full sm:w-auto">
          <button
            type="button"
            onClick={decrementQty}
            className="flex h-6.5 w-6 items-center justify-center rounded text-stone-500 hover:bg-white hover:text-stone-900 active:scale-90"
          >
            -
          </button>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-8 border-0 bg-transparent text-center text-xs font-bold text-stone-855 focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            onClick={incrementQty}
            className="flex h-6.5 w-6 items-center justify-center rounded text-stone-500 hover:bg-white hover:text-stone-900 active:scale-90"
          >
            +
          </button>
        </div>
      </div>

      {/* Col 5: Action Button */}
      <div className="sm:col-span-2.5 w-full sm:w-auto flex justify-end">
        <button
          onClick={handleAdd}
          className={`w-full sm:w-auto flex items-center justify-center space-x-1.5 rounded-xl py-2 px-4 text-xs font-bold text-white shadow-sm transition active:scale-[0.97] ${
            isAdded
              ? 'bg-emerald-600 shadow-emerald-700/10'
              : 'bg-amber-800 hover:bg-amber-900 shadow-amber-800/10'
          }`}
        >
          {isAdded ? (
            <>
              <svg className="h-3.5 w-3.5 animate-bounce" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Added</span>
            </>
          ) : (
            <span>Add</span>
          )}
        </button>
      </div>
    </div>
  );
}
