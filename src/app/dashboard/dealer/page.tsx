'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import ProductRow, { Product } from '../../../components/ProductRow';
import EnquiryDrawer, { CartItem } from '../../../components/EnquiryDrawer';
import { supabase } from '../../../lib/supabaseClient';

const LOCAL_PRODUCTS: Product[] = [
  {
    id: 'f8c3c2d4-539c-4be6-8e54-52648d8a7c21',
    name: 'Commercial Plywood',
    description: 'High density commercial grade plywood with premium quality hardwood core. Termite resistant.',
    grade: 'Commercial Plywood',
    wood_type: 'Hardwood Core',
    thickness_options: ['4mm', '6mm', '9mm', '12mm', '16mm', '19mm'],
    size_options: ['6x4', '6x3', '5x4', '5x3', '8x4', '8x3', '7x4', '7x3'],
    quality_options: ['Commercial', 'Alternate', 'Red Core', 'Marine Ply'],
    image_url: '/wood_mr.png'
  },
  {
    id: 'd5c2e391-7640-42fe-bd1a-49339e71ab4a',
    name: 'Laminate',
    description: 'Sleek off-white decorative laminate sheets. High scratch resistance.',
    grade: 'Laminate',
    wood_type: 'Off White',
    thickness_options: ['Laminate'],
    size_options: ['8x4'],
    image_url: '/wood_calibrated.png'
  },
  {
    id: 'a1b2c3d4-539c-4be6-8e54-52648d8a7c22',
    name: 'Alternate Plywood',
    description: 'Premium Alternate core plywood with superior strength.',
    grade: 'Alternate Plywood',
    wood_type: 'Alternate Core',
    thickness_options: ['4mm', '6mm', '9mm', '12mm', '16mm', '19mm'],
    size_options: ['6x4', '6x3', '5x4', '5x3', '8x4', '8x3', '7x4', '7x3'],
    image_url: '/wood_mr.png'
  },
  {
    id: 'a1b2c3d4-539c-4be6-8e54-52648d8a7c23',
    name: 'Red Core Plywood',
    description: 'High quality Red Core hardwood plywood.',
    grade: 'Red Core Plywood',
    wood_type: 'Red Core',
    thickness_options: ['4mm', '6mm', '9mm', '12mm', '16mm', '19mm'],
    size_options: ['6x4', '6x3', '5x4', '5x3', '8x4', '8x3', '7x4', '7x3'],
    image_url: '/wood_mr.png'
  },
  {
    id: 'a1b2c3d4-539c-4be6-8e54-52648d8a7c24',
    name: 'Marine Plywood',
    description: 'Waterproof Marine Ply grade for extreme conditions.',
    grade: 'Marine Plywood',
    wood_type: 'Marine Ply',
    thickness_options: ['4mm', '6mm', '9mm', '12mm', '16mm', '19mm'],
    size_options: ['6x4', '6x3', '5x4', '5x3', '8x4', '8x3', '7x4', '7x3'],
    image_url: '/wood_mr.png'
  }
];

interface EnquiryItem {
  id: string;
  product_name?: string;
  thickness: string;
  size: string;
  quantity: number;
  quality?: string;
}

interface Enquiry {
  id: string;
  dealer_name: string;
  dealer_phone: string;
  delivery_location: string;
  comments?: string;
  status: string;
  billed_amount?: number | null;
  created_at: string;
  enquiry_items?: EnquiryItem[];
}

export default function DealerDashboard() {
  const router = useRouter();
  
  // Auth state
  const [dealerProfile, setDealerProfile] = useState<{
    full_name: string;
    phone_number: string;
    email: string;
    gstin?: string;
    shop_address?: string;
    device_registered?: boolean;
  } | null>(null);

  // Bottom Navigation tabs
  const [activeTab, setActiveTab] = useState<'catalog' | 'history' | 'profile'>('catalog');

  // App catalog states
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Cart / Drawer state
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Filter/Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [selectedSize, setSelectedSize] = useState('All');

  // Order history feeds
  const [orderHistory, setOrderHistory] = useState<Enquiry[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Edit Profile form state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGstin, setEditGstin] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [isProfileSaving, setIsProfileSaving] = useState(false);

  // 1-second countdown ticker
  useEffect(() => {
    setCurrentTime(Date.now());
    const ticker = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Fetch Order History for this dealer
  const fetchOrderHistory = async () => {
    if (!dealerProfile?.phone_number) return;
    try {
      const { data: dbEnquiries, error: enqErr } = await supabase
        .from('enquiries')
        .select('*, enquiry_items(*, products(name))')
        .eq('dealer_phone', dealerProfile.phone_number)
        .order('created_at', { ascending: false });

      if (enqErr) throw enqErr;

      const mappedEnquiries: Enquiry[] = (dbEnquiries || []).map((enq) => ({
        id: enq.id,
        dealer_name: enq.dealer_name,
        dealer_phone: enq.dealer_phone,
        delivery_location: enq.delivery_location,
        comments: enq.comments,
        status: enq.status,
        billed_amount: enq.billed_amount,
        created_at: enq.created_at,
        enquiry_items: (enq.enquiry_items || []).map((item: any) => ({
          id: item.id,
          product_name: item.products?.name || 'Plywood / Laminate',
          thickness: item.thickness,
          size: item.size,
          quantity: item.quantity,
          quality: item.quality,
        })),
      }));

      setOrderHistory(mappedEnquiries);
    } catch (err) {
      console.error('Failed to load order history from database:', err);
      // Fetch mock offline local history if Supabase query fails
      const offline = JSON.parse(localStorage.getItem('hd_offline_enquiries') || '[]');
      const mappedOffline: Enquiry[] = offline.map((eq: any, idx: number) => ({
        id: eq.id,
        dealer_name: eq.customer.dealer_name,
        dealer_phone: eq.customer.dealer_phone,
        delivery_location: eq.customer.delivery_location,
        comments: eq.customer.comments,
        status: eq.status || 'Pending',
        billed_amount: eq.billed_amount || null,
        created_at: eq.submittedAt || new Date().toISOString(),
        enquiry_items: eq.items.map((it: any, iIdx: number) => ({
          id: `off-item-${idx}-${iIdx}`,
          product_name: it.name,
          thickness: it.thickness,
          size: it.size,
          quantity: it.quantity,
          quality: it.quality,
        })),
      }));
      setOrderHistory(mappedOffline);
    }
  };

  // Check registration on mount
  useEffect(() => {
    const profileStr = localStorage.getItem('hd_dealer_profile');
    if (!profileStr) {
      router.push('/');
      return;
    }

    try {
      const profile = JSON.parse(profileStr);
      if (profile.full_name && profile.phone_number) {
        // Verify with live database that this phone number actually exists in dealers table!
        const verifyProfile = async () => {
          try {
            const { data, error } = await supabase
              .from('dealers')
              .select('*')
              .eq('phone_number', profile.phone_number)
              .maybeSingle();

            if (error || !data) {
              console.warn('Dealer profile not found in database. Wiping local session to trigger fresh registration.');
              localStorage.removeItem('hd_dealer_profile');
              document.cookie = 'hd_dealer_phone=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              document.cookie = 'hd_dealer_name=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              router.push('/');
            } else {
              setDealerProfile(profile);
              // Pre-populate edit form fields
              setEditName(profile.full_name);
              setEditPhone(profile.phone_number);
              setEditEmail(profile.email);
              setEditGstin(profile.gstin || '');
              setEditAddress(profile.shop_address || '');
            }
          } catch (e) {
            console.error('Failed to verify profile against database:', e);
            // Fallback for offline safety
            setDealerProfile(profile);
          }
        };
        verifyProfile();
      } else {
        router.push('/');
      }
    } catch (err) {
      console.error('Failed to parse dealer session:', err);
      router.push('/');
    }
  }, [router]);

  // Load products
  useEffect(() => {
    async function fetchProducts() {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          const normalized = data.map((p) => {
            const isLaminateProduct = p.grade?.toLowerCase() === 'laminate' || p.name?.toLowerCase().includes('laminate');
            return {
              ...p,
              name: p.name,
              grade: p.grade,
              size_options: isLaminateProduct 
                ? ['8x4'] 
                : ['6x4', '6x3', '5x4', '5x3', '8x4', '8x3', '7x4', '7x3'],
              thickness_options: isLaminateProduct 
                ? ['Laminate'] 
                : ['4mm', '6mm', '9mm', '12mm', '16mm', '19mm'],
              quality_options: isLaminateProduct
                ? []
                : ['Commercial', 'Alternate', 'Red Core', 'Marine Ply']
            };
          });

          // Deduplicate
          const uniqueProducts: Product[] = [];
          normalized.forEach((item) => {
            if (!uniqueProducts.some((up) => up.name === item.name)) {
              uniqueProducts.push(item);
            }
          });

          // Category Assurance: Ensure all 5 exist
          const hasPlywood = uniqueProducts.some((p) => p.name === 'Commercial Plywood');
          const hasLaminate = uniqueProducts.some((p) => p.name === 'Laminate');
          const hasAlternate = uniqueProducts.some((p) => p.name === 'Alternate Plywood');
          const hasRedCore = uniqueProducts.some((p) => p.name === 'Red Core Plywood');
          const hasMarine = uniqueProducts.some((p) => p.name === 'Marine Plywood');

          if (!hasPlywood) uniqueProducts.unshift(LOCAL_PRODUCTS[0]);
          if (!hasLaminate) uniqueProducts.push(LOCAL_PRODUCTS[1]);
          if (!hasAlternate) uniqueProducts.push(LOCAL_PRODUCTS[2]);
          if (!hasRedCore) uniqueProducts.push(LOCAL_PRODUCTS[3]);
          if (!hasMarine) uniqueProducts.push(LOCAL_PRODUCTS[4]);

          setProducts(uniqueProducts);
          setIsDemoMode(false);
        } else {
          setProducts(LOCAL_PRODUCTS);
          setIsDemoMode(true);
        }
      } catch (err) {
        console.error('Failed to load products, using local fallback:', err);
        setProducts(LOCAL_PRODUCTS);
        setIsDemoMode(true);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProducts();
  }, []);

  // Fetch history when tab is clicked or profile is loaded
  useEffect(() => {
    if (dealerProfile && activeTab === 'history') {
      fetchOrderHistory();
    }
  }, [dealerProfile, activeTab]);

  // Cart operations
  const handleAddToEnquiry = (product: Product, thickness: string, size: string, quantity: number, quality?: string) => {
    setCartItems((prevItems) => {
      const idx = prevItems.findIndex(
        (item) => item.product.id === product.id && item.thickness === thickness && item.size === size && item.quality === quality
      );

      if (idx > -1) {
        const updated = [...prevItems];
        updated[idx] = {
          ...updated[idx],
          quantity: updated[idx].quantity + quantity,
        };
        return updated;
      }

      return [...prevItems, { product, thickness, size, quantity, quality }];
    });
  };

  const handleUpdateQty = (productId: string, thickness: string, size: string, newQty: number, quality?: string) => {
    if (newQty < 1) {
      handleRemoveItem(productId, thickness, size, quality);
      return;
    }
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.product.id === productId && item.thickness === thickness && item.size === size && item.quality === quality
          ? { ...item, quantity: newQty }
          : item
      )
    );
  };

  const handleRemoveItem = (productId: string, thickness: string, size: string, quality?: string) => {
    setCartItems((prevItems) =>
      prevItems.filter(
        (item) => !(item.product.id === productId && item.thickness === thickness && item.size === size && item.quality === quality)
      )
    );
  };

  const handleClearCart = () => setCartItems([]);

  // Profile update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editPhone.trim() || !editEmail.trim()) return;

    setIsProfileSaving(true);
    const updatedProfile = {
      full_name: editName.trim(),
      phone_number: editPhone.trim(),
      email: editEmail.trim(),
      gstin: editGstin.trim() || undefined,
      shop_address: editAddress.trim() || undefined,
      device_registered: true,
    };

    try {
      const { error } = await supabase
        .from('dealers')
        .upsert([updatedProfile], { onConflict: 'phone_number' });

      if (error) throw error;

      localStorage.setItem('hd_dealer_profile', JSON.stringify(updatedProfile));
      document.cookie = `hd_dealer_phone=${encodeURIComponent(updatedProfile.phone_number)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `hd_dealer_name=${encodeURIComponent(updatedProfile.full_name)}; path=/; max-age=31536000; SameSite=Lax`;

      setDealerProfile(updatedProfile);
      setIsProfileModalOpen(false);
    } catch (err) {
      console.error('Failed to update profile online, saving locally:', err);
      localStorage.setItem('hd_dealer_profile', JSON.stringify(updatedProfile));
      setDealerProfile(updatedProfile);
      setIsProfileModalOpen(false);
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (dealerProfile?.phone_number) {
        await supabase
          .from('dealers')
          .update({ device_registered: false })
          .eq('phone_number', dealerProfile.phone_number);
      }
    } catch (err) {
      console.error('Failed to de-register device on logout:', err);
    }
    localStorage.removeItem('hd_dealer_profile');
    document.cookie = 'hd_dealer_phone=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'hd_dealer_name=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/');
  };

  // --- GRACE PERIOD OPERATIONS (EDIT & CANCEL) ---
  const getElapsedSeconds = (createdAtStr: string): number => {
    return Math.floor((currentTime - new Date(createdAtStr).getTime()) / 1000);
  };

  const handleCancelOrder = async (enquiryId: string) => {
    try {
      const { error } = await supabase
        .from('enquiries')
        .delete()
        .eq('id', enquiryId);

      if (error) throw error;
      fetchOrderHistory();
    } catch (err) {
      console.error('Failed to cancel live enquiry:', err);
      // Offline local array fallback
      const offline = JSON.parse(localStorage.getItem('hd_offline_enquiries') || '[]');
      const filtered = offline.filter((eq: any) => eq.id !== enquiryId);
      localStorage.setItem('hd_offline_enquiries', JSON.stringify(filtered));
      fetchOrderHistory();
    }
  };

  const handleEditOrder = async (order: Enquiry) => {
    try {
      // 1. Delete the old enquiry from Supabase to prevent duplicates
      const { error } = await supabase
        .from('enquiries')
        .delete()
        .eq('id', order.id);

      if (error) throw error;
    } catch (err) {
      console.warn('Could not delete old order during edit, continuing locally:', err);
      const offline = JSON.parse(localStorage.getItem('hd_offline_enquiries') || '[]');
      const filtered = offline.filter((eq: any) => eq.id !== order.id);
      localStorage.setItem('hd_offline_enquiries', JSON.stringify(filtered));
    }

    // 2. Load items back into cartItems
    const loadedItems: CartItem[] = (order.enquiry_items || []).map((item) => {
      const matchedProduct = products.find((p) => p.name === item.product_name) || products[0];
      return {
        product: matchedProduct,
        thickness: item.thickness,
        size: item.size,
        quantity: item.quantity,
      };
    });

    setCartItems(loadedItems);
    setIsCartOpen(true);
    setActiveTab('catalog');
    fetchOrderHistory();
  };

  // Filter products in Catalog tab
  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGrade = selectedGrade === 'All' || product.grade === selectedGrade;
    const matchesSize = selectedSize === 'All' || product.size_options.includes(selectedSize);

    return matchesSearch && matchesGrade && matchesSize;
  });

  const uniqueGrades = Array.from(new Set(products.map((p) => p.grade || 'Commercial Plywood')));
  const uniqueSizes = Array.from(new Set(products.flatMap((p) => p.size_options || []))).sort();

  if (!dealerProfile) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-amber-800" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">
            Opening HD PLY Portal...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50/50 wood-pattern flex flex-col font-sans pb-24">
      <Navbar
        cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        userName={dealerProfile.full_name}
        onLogout={handleLogout}
        onOpenProfile={() => {
          setEditName(dealerProfile.full_name);
          setEditPhone(dealerProfile.phone_number);
          setEditEmail(dealerProfile.email);
          setEditGstin(dealerProfile.gstin || '');
          setEditAddress(dealerProfile.shop_address || '');
          setIsProfileModalOpen(true);
        }}
      />

      {/* Main Container */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6 sm:px-6 lg:px-8">
        
        {/* Tab 1: Catalog view */}
        {activeTab === 'catalog' && (
          <div className="space-y-6">
            {/* Catalog Welcome Hero */}
            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-800">Wholesale Order Desk</span>
                <h2 className="text-xl font-black text-stone-900 mt-0.5">Welcome, {dealerProfile.full_name}</h2>
                <p className="text-xs text-stone-500 mt-1">Select dimensions and request wholesale quotes instantly.</p>
              </div>
              <div className="text-[10px] bg-stone-100 border border-stone-200/50 rounded-xl py-1.5 px-3 font-semibold text-stone-600">
                GSTIN: <span className="font-extrabold text-stone-850">{dealerProfile.gstin || 'NOT REGISTERED'}</span>
              </div>
            </div>

            {/* Filters panel */}
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
              <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest block">Search and Filter Catalog</span>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none"
                />

                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-xs text-stone-700 focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  {uniqueGrades.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>

                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  className="rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-xs text-stone-700 focus:outline-none"
                >
                  <option value="All">All Sizes</option>
                  {uniqueSizes.map((size) => (
                    <option key={size} value={size}>{size} ft</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="space-y-4">
              <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest block">Available Wholesale Categories</span>
              
              {isLoading ? (
                <div className="text-center py-20 bg-white border border-stone-200 rounded-3xl text-xs text-stone-400">Loading catalog items...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-20 bg-white border border-stone-200 rounded-3xl text-xs text-stone-400">No products match your criteria.</div>
              ) : (
                <div className="space-y-4">
                  {filteredProducts.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onAddToEnquiry={handleAddToEnquiry}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Order History */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-pop">
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-stone-900">Order & Enquiry History</h3>
                <p className="text-[10px] text-stone-500 mt-0.5">Track live statuses and finalize billing details</p>
              </div>
              <button
                onClick={fetchOrderHistory}
                className="text-[10px] border border-stone-200 hover:bg-stone-50 font-bold px-3 py-1.5 rounded-xl transition"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-4">
              {orderHistory.length === 0 ? (
                <div className="text-center py-20 bg-white border border-stone-200 rounded-3xl text-xs text-stone-400 font-medium">
                  No active enquiries found.
                </div>
              ) : (
                orderHistory.map((order) => {
                  const elapsed = getElapsedSeconds(order.created_at);
                  const remaining = 30 - elapsed;
                  const isLocked = remaining <= 0;
                  const sheetsCount = (order.enquiry_items || []).reduce((sum, item) => sum + item.quantity, 0);

                  return (
                    <div key={order.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs space-y-4 relative overflow-hidden">
                      {/* Ribbon status */}
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-black text-stone-850">Ref: {order.id.substring(0, 8).toUpperCase()}</span>
                            <span className="text-[9px] text-stone-400">{new Date(order.created_at).toLocaleString()}</span>
                          </div>
                          
                          <div className="mt-1 flex items-center space-x-2.5">
                            {/* Grace countdown timer or lock state */}
                            {!isLocked ? (
                              <span className="inline-flex items-center space-x-1.5 text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200/50 rounded-lg px-2 py-0.5 animate-pulse">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Editable: {Math.max(0, Math.floor(remaining / 60))}:{String(Math.max(0, remaining % 60)).padStart(2, '0')}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200 rounded-lg px-2 py-0.5">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span>Finalized & Sent</span>
                              </span>
                            )}

                            {/* Status label */}
                            <span className={`text-[10px] font-black rounded-lg px-2 py-0.5 border ${
                              order.status.toLowerCase() === 'pending'
                                ? 'border-amber-200 bg-amber-50 text-amber-900'
                                : order.status.toLowerCase() === 'contacted'
                                ? 'border-blue-200 bg-blue-50 text-blue-900'
                                : order.status.toLowerCase() === 'completed'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : 'border-stone-200 bg-stone-50 text-stone-600'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                        </div>

                        {/* Invoice Billed amount if completed */}
                        {order.status.toLowerCase() === 'completed' && order.billed_amount && (
                          <div className="text-right">
                            <span className="block text-[9px] text-stone-400 font-extrabold uppercase">Invoice Total</span>
                            <span className="text-sm font-black text-emerald-700">₹{order.billed_amount.toLocaleString('en-IN')}/-</span>
                          </div>
                        )}
                      </div>

                      {/* Items requested */}
                      <div className="bg-stone-50/50 border border-stone-100 rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(order.enquiry_items || []).map((item) => (
                          <div key={item.id} className="flex justify-between font-semibold">
                            <span className="text-stone-700">{item.product_name} ({item.thickness}, {item.size} ft{item.quality ? `, ${item.quality}` : ''})</span>
                            <span className="text-stone-900 font-bold">{item.quantity} sheets</span>
                          </div>
                        ))}
                      </div>

                      {/* Total details */}
                      <div className="flex justify-between items-center text-xs pt-1">
                        <div className="text-stone-500">
                          Delivery: <strong className="text-stone-850 font-bold">{order.delivery_location}</strong>
                        </div>
                        <span className="text-amber-800 font-black">{sheetsCount} Sheets Requested</span>
                      </div>

                      {/* Action buttons (Only editable within 3 minutes) */}
                      {!isLocked && (
                        <div className="flex space-x-3 pt-2.5 border-t border-stone-100">
                          <button
                            onClick={() => handleEditOrder(order)}
                            className="flex-1 bg-stone-900 hover:bg-stone-950 text-white py-2 rounded-xl text-xs font-bold shadow-sm transition"
                          >
                            Edit Order
                          </button>
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            className="flex-1 border border-red-200 bg-white hover:bg-red-50 text-red-650 py-2 rounded-xl text-xs font-bold transition"
                          >
                            Cancel Order
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Account Profile */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-pop max-w-lg mx-auto">
            {/* Dealer business card */}
            <div className="rounded-3xl border border-stone-200 bg-white overflow-hidden shadow-md">
              <div className="wood-gradient text-white p-6 relative">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/35 via-amber-950/65 to-stone-950/80" />
                <div className="relative flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-300">Authorized Wholesale Representative</span>
                    <h3 className="text-lg font-black mt-1">{dealerProfile.full_name}</h3>
                    <p className="text-xs text-stone-200 mt-0.5">{dealerProfile.email}</p>
                  </div>
                  <span className="text-2xl font-black opacity-30 text-white italic">HD PLY</span>
                </div>
              </div>

              <div className="p-6 space-y-4 bg-white text-xs font-semibold text-stone-700">
                <div className="flex justify-between border-b border-stone-100 pb-2.5">
                  <span className="text-stone-400">GSTIN / Tax ID:</span>
                  <span className="text-stone-900 uppercase font-black">{dealerProfile.gstin || 'Not Provided'}</span>
                </div>

                <div className="flex justify-between border-b border-stone-100 pb-2.5">
                  <span className="text-stone-400">Verified Contact:</span>
                  <span className="text-stone-900 font-bold">{dealerProfile.phone_number}</span>
                </div>

                <div className="flex justify-between border-b border-stone-100 pb-2.5">
                  <span className="text-stone-400">Device State:</span>
                  <span className="inline-flex items-center space-x-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-emerald-600 font-bold uppercase tracking-wider text-[9px]">Registered (Active)</span>
                  </span>
                </div>

                {dealerProfile.shop_address && (
                  <div className="flex flex-col space-y-1">
                    <span className="text-stone-400">Shop Address:</span>
                    <p className="text-stone-800 leading-relaxed font-normal bg-stone-50 border border-stone-100 rounded-xl p-3 italic">
                      "{dealerProfile.shop_address}"
                    </p>
                  </div>
                )}

                <div className="flex space-x-3 pt-3">
                  <button
                    onClick={() => {
                      setEditName(dealerProfile.full_name);
                      setEditPhone(dealerProfile.phone_number);
                      setEditEmail(dealerProfile.email);
                      setEditGstin(dealerProfile.gstin || '');
                      setEditAddress(dealerProfile.shop_address || '');
                      setIsProfileModalOpen(true);
                    }}
                    className="flex-1 border border-stone-200 hover:bg-stone-50 font-bold py-2.5 rounded-xl transition text-center"
                  >
                    Edit Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl shadow-sm transition"
                  >
                    Deregister Device
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Basket Overlay on Mobile viewports (Only catalog tab) */}
      {activeTab === 'catalog' && cartItems.length > 0 && (
        <div className="sticky bottom-20 z-30 mx-4 rounded-2xl border border-stone-200 bg-white/95 backdrop-blur py-3 px-4 shadow-lg lg:hidden flex items-center justify-between animate-pop">
          <div className="flex flex-col">
            <span className="text-[9px] font-extrabold text-stone-400 uppercase">Enquiry Drawer</span>
            <span className="text-xs font-bold text-stone-900">
              {cartItems.reduce((sum, item) => sum + item.quantity, 0)} sheets ({cartItems.length} categories)
            </span>
          </div>
          <button
            onClick={() => setIsCartOpen(true)}
            className="flex items-center space-x-2 rounded-xl bg-amber-800 px-4 py-2 text-xs font-bold text-white shadow-md active:scale-95 transition"
          >
            <span>Open Drawer</span>
          </button>
        </div>
      )}

      {/* Persistent Fixed bottom Navigation Bar for Mobile-first Workspace */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/80 py-2.5 px-6 flex justify-around items-center shadow-lg">
        {/* Tab 1: Catalog */}
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex flex-col items-center space-y-1 transition ${
            activeTab === 'catalog' ? 'text-amber-800 font-extrabold' : 'text-stone-400 font-semibold'
          }`}
        >
          <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeTab === 'catalog' ? 2.5 : 2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-[10px] uppercase tracking-wide">Catalog</span>
        </button>

        {/* Tab 2: History */}
        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center space-y-1 transition relative ${
            activeTab === 'history' ? 'text-amber-800 font-extrabold' : 'text-stone-400 font-semibold'
          }`}
        >
          <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeTab === 'history' ? 2.5 : 2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span className="text-[10px] uppercase tracking-wide">Orders</span>
          {orderHistory.some(o => getElapsedSeconds(o.created_at) < 30) && (
            <span className="absolute top-0 right-1 flex h-2 w-2 rounded-full bg-amber-600 animate-ping" />
          )}
        </button>

        {/* Tab 3: Profile */}
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center space-y-1 transition ${
            activeTab === 'profile' ? 'text-amber-800 font-extrabold' : 'text-stone-400 font-semibold'
          }`}
        >
          <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeTab === 'profile' ? 2.5 : 2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[10px] uppercase tracking-wide">Profile</span>
        </button>
      </div>

      {/* Enquiry Cart Drawer Panel */}
      <EnquiryDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        dealerProfile={dealerProfile}
        onSubmitSuccess={() => {
          fetchOrderHistory();
          setActiveTab('history');
        }}
      />

      {/* Wholesale Edit Profile Modal Overlay */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-md px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden flex flex-col animate-pop">
            <div className="wood-gradient text-white py-5 px-6 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider">My Dealer Profile</h3>
                <p className="text-[10px] text-amber-300">View and update wholesale registration details</p>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="text-stone-300 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-5 space-y-4 bg-white">
              <div>
                <label htmlFor="edit-name" className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Full Name *</label>
                <input
                  type="text"
                  id="edit-name"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-phone" className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Phone Number *</label>
                <input
                  type="tel"
                  id="edit-phone"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-email" className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Email Address *</label>
                <input
                  type="email"
                  id="edit-email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-gstin" className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">GSTIN (Optional)</label>
                <input
                  type="text"
                  id="edit-gstin"
                  maxLength={15}
                  value={editGstin}
                  onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                  placeholder="29AAAAA1111A1Z1"
                  className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2 text-xs text-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-address" className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Shop Address (Optional)</label>
                <textarea
                  id="edit-address"
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2 text-xs text-stone-900 focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="flex-1 border border-stone-200 text-stone-550 rounded-xl py-2.5 text-xs font-bold hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProfileSaving}
                  className="flex-1 bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-2.5 text-xs font-bold shadow-md transition"
                >
                  {isProfileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
