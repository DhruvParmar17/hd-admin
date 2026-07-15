'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface RegistrationWallProps {
  onRegisterSuccess: (dealerProfile: {
    full_name: string;
    phone_number: string;
    email: string;
    gstin?: string;
    shop_address?: string;
  }) => void;
}

export default function RegistrationWall({ onRegisterSuccess }: RegistrationWallProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [shopAddress, setShopAddress] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    // Basic validation
    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      setErrorMessage('Please fill in all compulsory fields.');
      setIsSubmitting(false);
      return;
    }

    const dealerData = {
      full_name: fullName.trim(),
      phone_number: phone.trim(),
      email: email.trim(),
      gstin: gstin.trim() || undefined,
      shop_address: shopAddress.trim() || undefined,
      device_registered: true,
    };

    try {
      // 1. Save to Supabase
      const { error } = await supabase
        .from('dealers')
        .upsert([dealerData], { onConflict: 'phone_number' });

      if (error) throw error;

      // 2. Save in LocalStorage & Cookies for persistency
      localStorage.setItem('hd_dealer_profile', JSON.stringify(dealerData));
      document.cookie = `hd_dealer_phone=${encodeURIComponent(dealerData.phone_number)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `hd_dealer_name=${encodeURIComponent(dealerData.full_name)}; path=/; max-age=31536000; SameSite=Lax`;

      // 3. Callback to update state
      onRegisterSuccess(dealerData);
    } catch (err: unknown) {
      console.error('Registration DB insert failed, enabling mock offline mode:', err);
      
      // Offline fallback: save to localStorage/cookies anyway
      localStorage.setItem('hd_dealer_profile', JSON.stringify(dealerData));
      document.cookie = `hd_dealer_phone=${encodeURIComponent(dealerData.phone_number)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `hd_dealer_name=${encodeURIComponent(dealerData.full_name)}; path=/; max-age=31536000; SameSite=Lax`;

      onRegisterSuccess(dealerData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-md px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl border border-amber-800/20 bg-white shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header Banner */}
        <div className="wood-gradient text-white py-8 px-6 text-center relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/30 via-amber-950/60 to-stone-950/80" />
          <div className="relative space-y-1">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600 text-white shadow-md shadow-amber-900/20 text-2xl font-black mb-3">
              HD
            </div>
            <h2 className="text-2xl font-black tracking-tight">HD PLY</h2>
            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest">
              B2B Dealer Registration
            </p>
            <p className="text-stone-300 text-xs max-w-xs mx-auto mt-2.5">
              Access wholesale stock, custom thickness grades, and build bulk sheet enquiries.
            </p>
          </div>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 bg-white">
          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 flex items-start space-x-2.5">
              <svg className="h-5 w-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-800 font-semibold">{errorMessage}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Full Name (Compulsory) */}
            <div>
              <label htmlFor="reg-name" className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                Full Name *
              </label>
              <input
                type="text"
                id="reg-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ramesh Patel"
                className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/30 px-3.5 py-3 text-sm text-stone-900 shadow-xs focus:border-amber-850 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
            </div>

            {/* Phone Number (Compulsory) */}
            <div>
              <label htmlFor="reg-phone" className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                Phone Number (WhatsApp) *
              </label>
              <input
                type="tel"
                id="reg-phone"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/30 px-3.5 py-3 text-sm text-stone-900 shadow-xs focus:border-amber-850 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
            </div>

            {/* Email Address (Compulsory) */}
            <div>
              <label htmlFor="reg-email" className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                Email Address *
              </label>
              <input
                type="email"
                id="reg-email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. ramesh.patel@gmail.com"
                className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/30 px-3.5 py-3 text-sm text-stone-900 shadow-xs focus:border-amber-850 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
            </div>

            {/* Divider */}
            <div className="relative py-2 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-100" />
              </div>
              <span className="relative bg-white px-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                Optional Details
              </span>
            </div>

            {/* GSTIN (Optional) */}
            <div>
              <label htmlFor="reg-gstin" className="block text-xs font-bold text-stone-600 uppercase tracking-wider">
                GSTIN (Optional)
              </label>
              <input
                type="text"
                id="reg-gstin"
                maxLength={15}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 29AAAAA1111A1Z1"
                className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/30 px-3.5 py-3 text-sm text-stone-900 shadow-xs focus:border-amber-850 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
            </div>

            {/* Shop Address (Optional) */}
            <div>
              <label htmlFor="reg-address" className="block text-xs font-bold text-stone-600 uppercase tracking-wider">
                Shop/Delivery Address (Optional)
              </label>
              <textarea
                id="reg-address"
                rows={2}
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="e.g. Patel Timber Mart, Outer Ring Road, Bangalore"
                className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/30 px-3.5 py-2.5 text-sm text-stone-900 shadow-xs focus:border-amber-850 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-800 resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-6 bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3.5 text-sm font-bold shadow-md shadow-amber-800/10 transition active:scale-[0.98] disabled:bg-stone-300 disabled:shadow-none flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Registering Profile...</span>
              </>
            ) : (
              <span>Enter Dealer Portal</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
