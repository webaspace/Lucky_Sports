'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminDashboard from "@/components/AdminDashboard";
import VendorPanel from "@/components/VendorPanel";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, Heart, LayoutDashboard, LogOut, Menu, Package, Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart, SlidersHorizontal, Store, Truck, X, Zap } from 'lucide-react';
type Product = {
  id: string;
  name: string;
  category: string;
  price: number | string;
  compare_at_price?: number | string | null;
  stock: number;
  description: string;
  emoji: string;
  status: string;
  vendor_name?: string;
  vendor_id?: string;
};
type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};
const money = (n: number | string) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(Number(n) || 0);
const emojiFor = (p: Product) => p.emoji || '🏅';
async function api(url: string, method = 'GET', body?: any) {
  const r = await fetch(url, {
    method,
    headers: body ? {
      'Content-Type': 'application/json'
    } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export default function Marketplace() {
  const checkoutKey = useRef<string | null>(null);
  const productRequest = useRef(0);
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<string[]>([]),
    [hasMoreProducts, setHasMoreProducts] = useState(false),
    [loadingProducts, setLoadingProducts] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [category, setCategory] = useState('All sports'),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('featured'),
    [wishlist, setWishlist] = useState<string[]>([]),
    [wishlistProducts, setWishlistProducts] = useState<Product[]>([]),
    [addresses, setAddresses] = useState<any[]>([]),
    [cart, setCart] = useState<any[]>([]),
    [orders, setOrders] = useState<any[]>([]),
    [adminData, setAdminData] = useState<any>({
      vendors: [],
      products: [],
      categories: [],
      commissionRate: 0.3
    }),
    [vendorData, setVendorData] = useState<any>({
      vendor: null,
      products: [],
      orders: [],
      hasMoreOrders: false
    });
  const [modal, setModal] = useState(''),
    [editingProduct, setEditingProduct] = useState<string | null>(null),
    [authMode, setAuthMode] = useState('login'),
    [drawer, setDrawer] = useState(false),
    [tab, setTab] = useState('overview'),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<any>({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    store_name: '',
    description: '',
    shipping_name: '',
    shipping_phone: '',
    shipping_address: ''
  });
  const [newProduct, setNewProduct] = useState<any>({
    name: '',
    category: '',
    price: '',
    stock: '',
    description: '',
    emoji: '🏅'
  });
  const notify = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(''), 3500);
  };
  const loadProducts = useCallback(async (offset = 0) => {
    const requestId = ++productRequest.current;
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams({ category, q: search.trim(), sort, limit: '24', offset: String(offset) });
      const d = await api(`/api/products?${params.toString()}`);
      if (requestId !== productRequest.current) return;
      setProducts(current => offset ? [...current, ...(d.products || [])] : d.products || []);
      setHasMoreProducts(Boolean(d.hasMore));
    } catch (e: any) {
      notify(e.message);
    } finally {
      if (requestId === productRequest.current) setLoadingProducts(false);
    }
  }, [category, search, sort]);
  const loadCategories = useCallback(async () => {
    try {
      const data = await api('/api/categories');
      const names = (data.categories || []).map((item: any) => String(item.name));
      setCategories(names);
      setNewProduct((current: any) => ({ ...current, category: current.category || names[0] || '' }));
    } catch (error: any) {
      notify(error.message);
    }
  }, []);
  const loadUser = useCallback(async () => {
    try {
      const d = await api('/api/me');
      setUser(d.user);
      if (d.user) {
        const [c, o, v, w, a] = await Promise.all([api('/api/cart').catch(() => ({
          items: []
        })), api('/api/orders').catch(() => ({
          orders: []
        })), api('/api/vendor').catch(() => ({
          vendor: null,
          products: []
        })), api('/api/wishlist').catch(() => ({ product_ids: [] })), api('/api/addresses').catch(() => ({ addresses: [] }))]);
        setCart(c.items || []);
        setOrders(o.orders || []);
        setVendorData(v);
        setWishlist(w.product_ids || []);
        setWishlistProducts(w.products || []);
        setAddresses(a.addresses || []);
      } else {
        setCart([]);
        setOrders([]);
        setWishlist([]);
        setWishlistProducts([]);
        setAddresses([]);
      }
    } catch {}
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => loadProducts(0), 220);
    loadUser();
    loadCategories();
    return () => window.clearTimeout(timer);
  }, [loadProducts, loadUser, loadCategories]);
  const visible = useMemo(() => {
    return products;
  }, [products]);
  const cartTotal = cart.reduce((s, x) => s + Number(x.price) * Number(x.quantity), 0),
    cartCount = cart.reduce((s, x) => s + Number(x.quantity), 0);
  const auth = async () => {
    setBusy(true);
    try {
      const authPayload = authMode === 'signup'
        ? { email: form.email, password: form.password, full_name: form.full_name, phone: form.phone }
        : { email: form.email, password: form.password };
      const d = await api('/api/auth/' + (authMode === 'signup' ? 'signup' : 'login'), 'POST', authPayload);
      setUser(d.user);
      setModal('');
      notify(authMode === 'signup' ? 'Account created. Welcome to Sportivo!' : 'Welcome back!');
      await loadUser();
      await loadProducts();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    await api('/api/auth/logout', 'POST', {});
    setUser(null);
    setCart([]);
    setOrders([]);
    setWishlist([]);
    setWishlistProducts([]);
    setAddresses([]);
    setTab('overview');
    setForm({ email: '', password: '', full_name: '', phone: '', store_name: '', description: '', shipping_name: '', shipping_phone: '', shipping_address: '' });
    notify('Signed out successfully');
  };
  const addCart = async (p: Product) => {
    if (!user) {
      setModal('auth');
      setAuthMode('login');
      return;
    }
    try {
      const old = cart.find(x => x.product_id === p.id);
      await api('/api/cart', 'POST', {
        product_id: p.id,
        quantity: Math.min(p.stock, Number(old?.quantity || 0) + 1)
      });
      await loadUser();
      notify('Added to your bag');
    } catch (e: any) {
      notify(e.message);
    }
  };
  const toggleWishlist = async (p: Product) => {
    if (!user) {
      setAuthMode('login');
      setModal('auth');
      return;
    }
    const saved = !wishlist.includes(p.id);
    try {
      await api('/api/wishlist', 'POST', { product_id: p.id, saved });
      setWishlist(current => saved ? [...new Set([...current, p.id])] : current.filter(id => id !== p.id));
      setWishlistProducts(current => saved ? [...current.filter(product => product.id !== p.id), p] : current.filter(product => product.id !== p.id));
      notify(saved ? 'Saved to your wishlist' : 'Removed from your wishlist');
    } catch (error: any) {
      notify(error.message);
    }
  };
  const saveAddress = async () => {
    try {
      const data = await api('/api/addresses', 'POST', {
        label: 'Home',
        full_name: form.shipping_name || user?.full_name,
        phone: form.shipping_phone,
        address: form.shipping_address,
        is_default: true
      });
      setAddresses(current => [data.address, ...current.filter(address => address.id !== data.address.id)]);
      notify('Delivery address saved.');
    } catch (error: any) {
      notify(error.message);
    }
  };
  const changeQty = async (p: any, q: number) => {
    try {
      await api('/api/cart', 'POST', {
        product_id: p.product_id,
        quantity: q,
        remove: q < 1
      });
      await loadUser();
    } catch (e: any) {
      notify(e.message);
    }
  };
  const checkout = async () => {
    if (!user) {
      setModal('auth');
      return;
    }
    setBusy(true);
    try {
      checkoutKey.current ??= crypto.randomUUID();
      const d = await api('/api/orders', 'POST', {
        shipping_name: form.shipping_name,
        shipping_phone: form.shipping_phone,
        shipping_address: form.shipping_address,
        idempotency_key: checkoutKey.current
      });
      checkoutKey.current = null;
      setDrawer(false);
      await loadProducts();
      await loadUser();
      setTab('orders');
      notify(`Order ${d.order.order_number} placed. Demo checkout only.`);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const cancelOrder = async (orderId: string) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await api('/api/orders', 'PATCH', { order_id: orderId });
      await Promise.all([api('/api/orders').then(data => setOrders(data.orders || [])), loadProducts(0)]);
      notify('Order cancelled.');
    } catch (error: any) {
      notify(error.message);
    }
  };
  const adminLoad = async () => {
    try {
      setAdminData(await api('/api/admin'));
    } catch (e: any) {
      notify(e.message);
    }
  };
  const adminAction = async (action: string, id: string, value: any, extra: Record<string, any> = {}) => {
    try {
      await api('/api/admin', 'POST', {
        action,
        id,
        value,
        ...extra
      });
      await adminLoad();
      await loadProducts();
      await loadCategories();
      notify('Changes saved');
    } catch (e: any) {
      notify(e.message);
    }
  };
  const deleteAdminProduct = async (id: string) => {
    try {
      await api('/api/admin', 'POST', {
        action: 'delete_product',
        id
      });
      await adminLoad();
      await loadProducts();
      notify('Product deleted successfully');
    } catch (error: any) {
      notify(error.message || 'Could not delete product');
    }
  };
  const openTab = (t: string) => {
    setTab(t);
    setMenuOpen(false);
    if (t === 'admin') adminLoad();
    if (t === 'vendor') api('/api/vendor').then(setVendorData).catch((e: any) => notify(e.message));
    if (t === 'orders') api('/api/orders').then(d => setOrders(d.orders)).catch(() => {});
  };
  const submitVendor = async () => {
    try {
      const d = await api('/api/vendor', 'POST', {
        store_name: form.store_name,
        description: form.description
      });
      notify(d.message);
      setModal('');
      await loadUser();
    } catch (e: any) {
      notify(e.message);
    }
  };
  const submitProduct = async () => {
    try {
      const product = {
        ...newProduct,
        price: Number(newProduct.price),
        stock: Number(newProduct.stock)
      };
      const d = editingProduct ? await api('/api/vendor', 'PATCH', {
        id: editingProduct,
        product
      }) : await api('/api/vendor', 'POST', {
        product
      });
      notify(d.message);
      await api('/api/vendor').then(setVendorData);
      await loadProducts(0);
      setModal('');
      setEditingProduct(null);
    } catch (e: any) {
      notify(e.message);
    }
  };
  const editVendorProduct = (p: any) => {
    setEditingProduct(p.id);
    setNewProduct({
      name: p.name,
      category: p.category,
      price: String(p.price),
      stock: String(p.stock),
      description: p.description || '',
      emoji: p.emoji || '🏅'
    });
    setModal('product');
  };
  const removeVendorProduct = async (id: string) => {
    if (!window.confirm('Delete this product from your store?')) return;
    try {
      await api(`/api/vendor?id=${encodeURIComponent(id)}`, 'DELETE');
      await api('/api/vendor').then(setVendorData);
      await loadProducts();
      notify('Product deleted.');
    } catch (e: any) {
      notify(e.message);
    }
  };
  const updateVendorOrder = async (fulfillmentId: string, status: string, tracking: any) => {
    try {
      await api('/api/vendor', 'PATCH', { action: 'fulfillment', fulfillment_id: fulfillmentId, status, ...tracking });
      await api('/api/vendor').then(setVendorData);
      notify('Order fulfillment updated.');
    } catch (error: any) {
      notify(error.message);
    }
  };
  const saveVendorTracking = async (fulfillmentId: string, tracking: any) => {
    try {
      const data = await api('/api/vendor', 'PATCH', { action: 'tracking', fulfillment_id: fulfillmentId, ...tracking });
      await api('/api/vendor').then(setVendorData);
      notify(data.message || 'Tracking details saved.');
    } catch (error: any) {
      notify(error.message);
    }
  };
  const updateReturnPickup = async (fulfillmentId: string, previousStatus: string, status: string) => {
    try {
      await api('/api/vendor', 'PATCH', { action: 'return_pickup', fulfillment_id: fulfillmentId, previous_status: previousStatus, status });
      await api('/api/vendor').then(setVendorData);
      notify('Return pickup updated.');
    } catch (error: any) {
      notify(error.message);
    }
  };
  const loadMoreVendorOrders = async () => {
    try {
      const offset = vendorData.orders?.length || 0;
      const data = await api(`/api/vendor?limit=50&offset=${offset}`);
      setVendorData((current: any) => ({
        ...data,
        orders: [...(current.orders || []), ...(data.orders || [])],
      }));
    } catch (error: any) {
      notify(error.message);
    }
  };
  const proposeCategory = async (name: string) => {
    try {
      const data = await api('/api/categories', 'POST', { name });
      await Promise.all([api('/api/vendor').then(setVendorData), loadCategories()]);
      notify(data.message || 'Category submitted for review.');
    } catch (error: any) {
      notify(error.message);
      throw error;
    }
  };
  const requestReturnPickup = async (orderId: string) => {
    try {
      const data = await api('/api/orders', 'PATCH', { action: 'return_pickup', order_id: orderId });
      await api('/api/orders').then((result) => setOrders(result.orders || []));
      notify(data.message || 'Return pickup requested.');
    } catch (error: any) {
      notify(error.message);
    }
  };
  const nav = [['overview', 'Discover', ShoppingBag], ['wishlist', 'Saved gear', Heart], ['orders', 'My orders', Package], ['vendor', 'Sell on Sportivo', Store], ...(user?.role === 'admin' ? [(['admin', 'Admin studio', LayoutDashboard] as any)] : [])];
  return <main className="site-shell">
  <div className="announcement"><span><Zap size={14} /> THE SPORTS GEAR DESTINATION</span><span>Free shipping over ₹1,999 <ArrowRight size={13} /></span></div>
  <header className="topbar"><button className="mobile-menu icon-btn" onClick={() => setMenuOpen(!menuOpen)}><Menu /></button><button className="logo" onClick={() => openTab('overview')}><span className="logo-mark">S</span><span>sportivo<span className="logo-dot">.</span><small>GEAR UP. GET OUT THERE.</small></span></button><div className="searchbox"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shoes, cricket bats, training gear..." /><kbd>⌘ K</kbd></div><div className="header-actions"><button className="icon-btn saved-btn" onClick={() => openTab('wishlist')}><Heart /><span className="desktop-label">Saved</span></button><button className="icon-btn bag-btn" onClick={() => setDrawer(true)}><ShoppingCart /><span className="desktop-label">Bag</span>{cartCount > 0 && <b>{cartCount}</b>}</button>{user ? <button className="account-chip" onClick={() => setModal('account')}><span className="avatar">{user.full_name?.slice(0, 1).toUpperCase()}</span><span className="desktop-label">{user.full_name.split(' ')[0]}</span><ChevronDown size={14} /></button> : <button className="btn btn-dark signin" onClick={() => {
          setAuthMode('login');
          setModal('auth');
        }}>Sign in <ArrowRight size={15} /></button>}</div></header>
  <div className={'layout ' + (menuOpen ? 'menu-open' : '')}><aside className="sidebar"><div className="sidebar-label">YOUR SPORT, YOUR WAY</div>{nav.map(([id, label, Icon]: any) => <button key={id} className={'nav-link ' + (tab === id ? 'active' : '')} onClick={() => openTab(id)}><Icon size={18} />{label}{id === 'wishlist' && wishlist.length > 0 && <span className="nav-count">{wishlist.length}</span>}</button>)}<div className="sidebar-divider" /><div className="sidebar-label">SHOP BY SPORT</div>{categories.map(c => <button key={c} className={'category-link ' + (category === c ? 'selected' : '')} onClick={() => {
          setCategory(c);
          setTab('overview');
        }}><span className="category-emoji">🏅</span>{c}<ArrowUpRight size={13} /></button>)}<div className="sidebar-promo"><div className="promo-symbol">✳</div><b>Make room<br />for your next<br />personal best.</b><p>Find gear that moves with you.</p><button onClick={() => {
            setCategory('All sports');
            setTab('overview');
          }}>Explore gear <ArrowRight size={14} /></button></div><div className="sidebar-foot"><ShieldCheck size={16} /><span>Secure checkout<br /><small>Demo payments only</small></span></div></aside>
  <section className="content-area">{tab === 'overview' && <><section className="hero"><div className="hero-content"><div className="eyebrow"><span /> BUILT FOR EVERY KIND OF PLAYER</div><h1>Find your<br /><em>game face.</em></h1><p>From first practice to match point, find the gear that helps you show up at your best.</p><button className="btn btn-lime" onClick={() => document.getElementById('catalog')?.scrollIntoView({
                behavior: 'smooth'
              })}>Shop the collection <ArrowRight size={17} /></button><div className="hero-proof"><div className="proof-avatars"><span>🏃</span><span>🏏</span><span>⚽</span></div><div><b>Made for movement</b><small>Gear for every game, every day.</small></div></div></div><div className="hero-art"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-sticker">PLAY<br />YOUR<br />WAY <ArrowDownRight size={19} /></div><div className="hero-gear gear-ball">⚽</div><div className="hero-gear gear-shoe">👟</div><div className="hero-gear gear-bat">🏏</div><div className="hero-art-caption"><span>01 / 08</span><span>THE NEW SEASON EDIT</span></div></div><div className="hero-index">S—01</div></section>
   <div className="benefit-strip"><div><Truck /><span><b>Free shipping</b><small>Orders over ₹1,999</small></span></div><div><ShieldCheck /><span><b>Shop with confidence</b><small>Curated sports essentials</small></span></div><div><Activity /><span><b>Made for your game</b><small>Gear for every level</small></span></div><div><Clock3 /><span><b>Easy order tracking</b><small>Stay in the loop</small></span></div></div>
   <section className="catalog-section" id="catalog"><div className="section-heading"><div><div className="eyebrow">THE GOOD STUFF</div><h2>Gear up <em>for more.</em></h2><p>Everyday essentials. Game-day favourites. All in one place.</p></div><div className="catalog-controls"><label><SlidersHorizontal size={15} /><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div></div><div className="chips"><button className={category === 'All sports' ? 'chip active' : 'chip'} onClick={() => setCategory('All sports')}>All gear</button>{categories.map(c => <button className={category === c ? 'chip active' : 'chip'} key={c} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="product-grid">{visible.map((p, i) => <ProductCard key={p.id} p={p} saved={wishlist.includes(p.id)} onSave={() => toggleWishlist(p)} onAdd={() => addCart(p)} index={i} />)}</div>{!visible.length && <div className="empty-state"><div>🔎</div><h3>No gear found just yet.</h3><p>Try another sport or search term.</p><button className="btn btn-dark" onClick={() => {
                setSearch('');
                setCategory('All sports');
              }}>Reset filters</button></div>}<div className="catalog-bottom"><span>SHOWING <b>{visible.length}</b> ITEMS</span><span>FIND YOUR NEXT FAVOURITE <ArrowRight size={14} /></span></div>{hasMoreProducts && <button className="btn btn-outline" disabled={loadingProducts} onClick={() => loadProducts(products.length)}>{loadingProducts ? "Loading…" : "Load more products"}</button>}</section>
   <section className="seller-banner"><div className="seller-icon"><Store size={27} /></div><div><div className="eyebrow">BUILT FOR INDEPENDENT SELLERS</div><h3>Your sports store belongs here.</h3><p>Reach athletes and fans who care about their gear as much as you do.</p></div><button className="btn btn-lime" onClick={() => {
              if (!user) {
                setAuthMode('signup');
                setModal('auth');
              } else setModal('vendor');
            }}>Become a seller <ArrowRight size={16} /></button></section></>}
   {tab === 'wishlist' && <Dashboard title="Your saved gear" subtitle="The pieces you want to come back to."><div className="product-grid">{wishlistProducts.map((p, i) => <ProductCard key={p.id} p={p} saved onSave={() => toggleWishlist(p)} onAdd={() => addCart(p)} index={i} />)}</div>{!wishlistProducts.length && <Empty title="Nothing saved. Yet." desc="Tap the heart on any product to keep it close." />}</Dashboard>}
   {tab === 'orders' && <Dashboard title="Your orders" subtitle="Every order, from placed to delivered."><div className="orders-list">{orders.map(o => <div className="order-card" key={o.id}><div className="order-top"><div><small>ORDER NUMBER</small><b>{o.order_number}</b></div><span className={'status status-' + o.status}>{String(o.status).replaceAll('_', ' ')}</span></div><div className="order-items">{(o.items || []).map((i: any, j: number) => <span key={j}>{i.product_name_snapshot} × {i.quantity}</span>)}</div>{(o.fulfillments || []).map((fulfillment: any) => <div className="customer-fulfillment" key={fulfillment.fulfillment_id}><span><b>{fulfillment.vendor_name}</b> · {String(fulfillment.status).replaceAll("_", " ")}</span>{fulfillment.carrier_name && <small>{fulfillment.carrier_name}</small>}{fulfillment.tracking_number && <small>Tracking: {fulfillment.tracking_number}</small>}{fulfillment.tracking_url && <a href={fulfillment.tracking_url} target="_blank" rel="noreferrer">Track package <ArrowRight size={13} /></a>}{fulfillment.return_pickup_status !== "none" && <small>Return pickup: {String(fulfillment.return_pickup_status).replaceAll("_", " ")}</small>}{(fulfillment.return_history || []).map((event: any, index: number) => <small key={`${event.created_at}-${index}`}>Pickup update: {String(event.status).replaceAll("_", " ")} · {new Date(event.created_at).toLocaleDateString("en-IN")}</small>)}</div>)}<div className="order-bottom"><span>{new Date(o.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}</span><b>{money(Number(o.subtotal) + Number(o.shipping_amount))}</b><small>Demo payment · {o.payment_status}</small></div>{["placed","confirmed","packed"].includes(o.status) && <button className="btn btn-quiet" onClick={() => cancelOrder(o.id)}>Cancel order</button>}{["cancelled","delivered"].includes(o.status) && !(o.fulfillments || []).some((fulfillment: any) => fulfillment.return_pickup_status !== "none") && <button className="btn btn-outline" onClick={() => requestReturnPickup(o.id)}><Truck size={14} /> Request return pickup</button>}</div>)}{!orders.length && <Empty title="Your next favourite is out there." desc="Your orders will show up here after checkout." />}</div></Dashboard>}
   {tab === 'vendor' && <VendorPanel data={vendorData} money={money} openApply={() => { setForm(current => ({ ...current, store_name: vendorData.vendor?.store_name || '', description: vendorData.vendor?.description || '' })); setModal('vendor'); }} onOrderAction={updateVendorOrder} onTrackingUpdate={saveVendorTracking} onReturnPickupAction={updateReturnPickup} onProposeCategory={proposeCategory} onLoadMoreOrders={loadMoreVendorOrders} addProduct={() => {
          setEditingProduct(null);
          setNewProduct({
            name: '',
            category: categories[0] || '',
            price: '',
            stock: '',
            description: '',
            emoji: '🏅'
          });
          setModal('product');
        }} onEdit={editVendorProduct} onDelete={removeVendorProduct} />}
   {tab === "admin" && user?.role === "admin" && <AdminDashboard vendors={adminData.vendors || []} products={adminData.products || []} categories={adminData.categories || []} commissionRate={Number(adminData.commissionRate ?? 0.3)} money={money} onVendorAction={(id, value, reason) => adminAction("vendor", id, value, { reason })} onVendorActive={(id, active) => adminAction('vendor-active', id, active)} onProductAction={(id, value, reason) => adminAction("product", id, value, { reason })} onDeleteProduct={deleteAdminProduct} onCategoryAction={(id, value, reason) => adminAction("category", id, value, { reason })} />}
   <footer className="footer"><div className="logo footer-logo"><span className="logo-mark">S</span><span>sportivo<span className="logo-dot">.</span><small>GEAR UP. GET OUT THERE.</small></span></div><p>For the love of the game, whatever your game.</p><div>© 2026 Sportivo · Demo checkout · Built for movement</div></footer>
  </section></div>
  {drawer && <div className="overlay" onMouseDown={e => {
      if (e.target === e.currentTarget) setDrawer(false);
    }}><aside className="cart-drawer"><div className="drawer-head"><div><div className="eyebrow">YOUR KIT</div><h2>Your bag <span>({cartCount})</span></h2></div><button className="icon-btn" onClick={() => setDrawer(false)}><X /></button></div>{cart.length ? <><div className="cart-items">{cart.map((p: any) => <div className="cart-item" key={p.product_id}><div className="cart-thumb">{p.emoji || '🏅'}</div><div className="cart-item-info"><b>{p.name}</b><small>{p.category}</small><strong>{money(p.price)}</strong><div className="qty"><button onClick={() => changeQty(p, Number(p.quantity) - 1)}>−</button><span>{p.quantity}</span><button onClick={() => changeQty(p, Number(p.quantity) + 1)}>+</button></div></div><button className="remove" onClick={() => changeQty(p, 0)}><X size={15} /></button></div>)}</div><div className="checkout"><div><span>Subtotal</span><b>{money(cartTotal)}</b></div><div><span>Shipping</span><b>{cartTotal >= 1999 ? 'FREE' : money(99)}</b></div><div className="total"><span>Total</span><b>{money(cartTotal + (cartTotal >= 1999 ? 0 : 99))}</b></div><p className="demo-note"><ShieldCheck size={15} /> Demo checkout only — no payment is collected.</p>{addresses.length>0 && <label>Saved address<select className="form-input" defaultValue="" onChange={event=>{const selected=addresses.find(address=>address.id===event.target.value);if(selected)setForm(current=>({...current,shipping_name:selected.full_name,shipping_phone:selected.phone,shipping_address:selected.address}));}}><option value="">Choose a saved address</option>{addresses.map(address=><option key={address.id} value={address.id}>{address.label} · {address.address}</option>)}</select></label>}<label>Delivery name<input className="form-input" value={form.shipping_name} onChange={e => setForm({
                ...form,
                shipping_name: e.target.value
              })} placeholder={user?.full_name || 'Full name'} /></label><label>Phone number<input className="form-input" value={form.shipping_phone} onChange={e => setForm({
                ...form,
                shipping_phone: e.target.value
              })} placeholder="Mobile number" /></label><label>Delivery address<textarea className="form-input" value={form.shipping_address} onChange={e => setForm({
                ...form,
                shipping_address: e.target.value
              })} placeholder="House, street, city, PIN code" /></label><button type="button" className="btn btn-outline full-btn" onClick={saveAddress}>Save this address</button><button className="btn btn-dark full-btn" disabled={busy} onClick={checkout}>{busy ? 'Placing order…' : 'Place demo order'} <ArrowRight size={16} /></button></div></> : <div className="empty-state"><div>🛍️</div><h3>Your bag is taking a breather.</h3><p>Find something that gets you moving.</p><button className="btn btn-dark" onClick={() => setDrawer(false)}>Explore gear</button></div>}</aside></div>}
  {modal === 'auth' && <Modal close={() => setModal('')}><div className="auth-icon">S</div><div className="eyebrow">WELCOME TO SPORTIVO</div><h2>{authMode === 'login' ? 'Good to see you.' : 'Join the movement.'}</h2><p>{authMode === 'login' ? 'Sign in to pick up where you left off.' : 'Create an account to save gear and track your orders.'}</p>{authMode === 'signup' && <><label>Full name<input className="form-input" value={form.full_name} onChange={e => setForm({
            ...form,
            full_name: e.target.value
          })} placeholder="Your full name" /></label><label>Phone (optional)<input className="form-input" value={form.phone} onChange={e => setForm({
            ...form,
            phone: e.target.value
          })} placeholder="Mobile number" /></label></>}<label>Email address<input className="form-input" type="email" value={form.email} onChange={e => setForm({
          ...form,
          email: e.target.value
        })} placeholder="you@example.com" /></label><label>Password<input className="form-input" type="password" value={form.password} onChange={e => setForm({
          ...form,
          password: e.target.value
        })} placeholder="At least 8 characters" /></label><button className="btn btn-dark full-btn" disabled={busy} onClick={auth}>{busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></button><p className="switch-auth">{authMode === 'login' ? "New to Sportivo? " : 'Already have an account? '}<button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>{authMode === 'login' ? 'Create account' : 'Sign in'}</button></p><small className="fine-print">Your password is hashed before it is stored. Use a unique password.</small></Modal>}
  {modal === 'account' && <Modal close={() => setModal('')}><div className="account-modal-avatar">{user?.full_name?.slice(0, 1)}</div><h2>{user?.full_name}</h2><p>{user?.email}</p><span className="status status-approved">{user?.role?.replace('_', ' ')}</span><div className="account-actions"><button onClick={() => {
          setModal('');
          openTab('orders');
        }}><Package size={17} /> My orders</button><button onClick={() => {
          setModal('');
          openTab('vendor');
        }}><Store size={17} /> Seller studio</button><button onClick={signOut}><LogOut size={17} /> Sign out</button></div></Modal>}
  {modal === 'vendor' && <Modal close={() => setModal('')}><div className="auth-icon"><Store /></div><div className="eyebrow">SELLER APPLICATION</div><h2>Open your sports store.</h2><p>Applications are reviewed before you can publish products.</p><label>Store name<input className="form-input" value={form.store_name} onChange={e => setForm({
          ...form,
          store_name: e.target.value
        })} placeholder="Your sports store" /></label><label>Store description<textarea className="form-input" value={form.description} onChange={e => setForm({
          ...form,
          description: e.target.value
        })} placeholder="What makes your store special?" /></label><button className="btn btn-dark full-btn" onClick={submitVendor}>Submit application <ArrowRight size={16} /></button></Modal>}
  {modal === 'product' && <Modal close={() => setModal('')}><div className="eyebrow">SELLER STUDIO</div><h2>List a product.</h2><p>New listings remain pending until approved by the admin. Product categories must also be approved.</p>{!categories.length && <p className="form-note">There are no approved categories yet. Suggest one in your seller studio and wait for admin approval.</p>}{newProduct.category && !categories.includes(newProduct.category) && <p className="form-note">This category is not approved yet. Choose an approved category or wait for admin review.</p>}<label>Product name<input className="form-input" value={newProduct.name} onChange={e => setNewProduct({
          ...newProduct,
          name: e.target.value
        })} placeholder="Training shoes" /></label><div className="field-pair"><label>Category<select className="form-input" value={newProduct.category} onChange={e => setNewProduct({
            ...newProduct,
            category: e.target.value
          })}><option value="">Choose an approved category</option>{newProduct.category && !categories.includes(newProduct.category) && <option value={newProduct.category} disabled>{newProduct.category} — not approved</option>}{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label><label>Price (₹)<input className="form-input" type="number" value={newProduct.price} onChange={e => setNewProduct({
            ...newProduct,
            price: e.target.value
          })} placeholder="1499" /></label></div><label>Stock quantity<input className="form-input" type="number" value={newProduct.stock} onChange={e => setNewProduct({
          ...newProduct,
          stock: e.target.value
        })} placeholder="20" /></label><label>Description<textarea className="form-input" value={newProduct.description} onChange={e => setNewProduct({
          ...newProduct,
          description: e.target.value
        })} placeholder="Materials, fit and features" /></label><button className="btn btn-dark full-btn" disabled={!categories.includes(newProduct.category)} onClick={submitProduct}>Submit for approval <ArrowRight size={16} /></button></Modal>}
  {toast && <div className="toast"><Check size={16} />{toast}</div>}
 </main>;
}
function ProductCard({
  p,
  saved,
  onSave,
  onAdd,
  index
}: {
  p: Product;
  saved: boolean;
  onSave: () => void;
  onAdd: () => void;
  index: number;
}) {
  return <article className="product-card" style={{
    animationDelay: `${Math.min(index, 8) * 45}ms`
  }}><div className={'product-visual visual-' + index % 6}><span className="product-tag">{Number(p.stock) < 5 ? 'LOW STOCK' : 'AVAILABLE'}</span><button className={'save-product ' + (saved ? 'saved' : '')} onClick={onSave} aria-label="Save product"><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button><span className="product-emoji">{emojiFor(p)}</span><span className="visual-index">S / {String(index + 1).padStart(2, '0')}</span></div><div className="product-info"><div className="product-meta"><span>{p.category}</span><span>{Number(p.stock) > 0 ? `${p.stock} IN STOCK` : "SOLD OUT"}</span></div><h3>{p.name}</h3><p>{p.description}</p><div className="product-bottom"><div><strong>{money(p.price)}</strong>{p.compare_at_price && Number(p.compare_at_price) > Number(p.price) && <del>{money(p.compare_at_price)}</del>}</div><button className="add-btn" onClick={onAdd} disabled={Number(p.stock) < 1} aria-label="Add to bag"><Plus size={18} /></button></div></div></article>;
}
function Dashboard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return <section className="dashboard"><div className="dashboard-heading"><div className="eyebrow">YOUR SPORTIVO SPACE</div><h1>{title}</h1><p>{subtitle}</p></div>{children}</section>;
}
function Empty({
  title,
  desc
}: {
  title: string;
  desc: string;
}) {
  return <div className="empty-state"><div>✳</div><h3>{title}</h3><p>{desc}</p></div>;
}
function Modal({
  children,
  close
}: {
  children: React.ReactNode;
  close: () => void;
}) {
  return <div className="overlay modal-overlay" onMouseDown={e => {
    if (e.target === e.currentTarget) close();
  }}><section className="modal"><button className="modal-x icon-btn" onClick={close}><X /></button>{children}</section></div>;
}
