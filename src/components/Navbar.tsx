'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavbarProps {
  cartItemCount?: number;
  onOpenCart?: () => void;
  onOpenProfile?: () => void;
  userName?: string;
  onLogout?: () => void;
}

export default function Navbar({
  cartItemCount = 0,
  onOpenCart,
  onOpenProfile,
  userName,
  onLogout,
}: NavbarProps) {
  const pathname = usePathname();
  const isAdmin = pathname.includes('/dashboard/admin');

  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Logo and Branding */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-800 text-white shadow-md shadow-amber-800/20">
            <span className="text-lg font-black tracking-wider">HD</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-stone-900 leading-none">
              HD <span className="text-amber-800">PLY</span>
            </h1>
            <span className="text-[9px] font-bold uppercase tracking-widest text-stone-500 mt-1 block">
              WHOLESALE ADMIN
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {/* User Profile Button */}
          {userName && onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="flex items-center space-x-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-700 shadow-sm transition hover:border-amber-800/30 hover:bg-stone-50"
              title="View/Edit Profile"
              id="profile-settings-btn"
            >
              <svg className="h-4.5 w-4.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="hidden sm:inline text-xs font-bold truncate max-w-[80px]">
                {userName.split(' ')[0]}
              </span>
            </button>
          )}

          {/* Enquiry Basket (Only shown in dealer view) */}
          {!isAdmin && onOpenCart && (
            <button
              onClick={onOpenCart}
              className="group relative flex items-center space-x-1.5 rounded-xl bg-amber-850 px-3.5 py-2 text-white shadow-md shadow-amber-800/10 transition hover:bg-amber-900 active:scale-95"
              aria-label="Open Enquiry Drawer"
              id="enquiry-basket-btn"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
              </svg>
              <span className="hidden sm:inline text-xs font-bold">Basket</span>
              
              {cartItemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white ring-2 ring-white animate-pop">
                  {cartItemCount}
                </span>
              )}
            </button>
          )}

          {/* Logout (if registered) */}
          {userName && onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-red-50 hover:border-red-200 hover:text-red-650 transition text-stone-500"
              title="Logout / Deregister"
              id="logout-btn"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
