import React from "react";
import { Package, Plus, Store } from "lucide-react";

export type VendorProduct = {
  id: string;
  name: string;
  category: string;
  price: number | string;
  stock: number;
  emoji?: string;
  status: string;
};

export type VendorInfo = {
  store_name: string;
  verification_status: string;
  description?: string;
};

type Props = {
  vendor: VendorInfo | null;
  products: VendorProduct[];
  money: (value: number | string) => string;
  onApply: () => void;
  onAddProduct: () => void;
};

export default function VendorDashboard({
  vendor, products, money, onApply, onAddProduct
}: Props) {
  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div className="eyebrow">YOUR SPORTIVO SPACE</div>
        <h1>Seller studio</h1>
        <p>Grow your sports business with Sportivo.</p>
      </div>

      <div className="studio-grid">
        <div className="studio-card">
          <div className="studio-icon"><Store /></div>
          <h3>{vendor?.store_name || "Open your sports store"}</h3>
          <p>{vendor
            ? `Verification: ${vendor.verification_status}. ${vendor.description || ""}`
            : "Apply to sell sports gear to customers who love the game."}</p>
          {!vendor ? (
            <button className="btn btn-dark" onClick={onApply}>Apply to become a seller</button>
          ) : (
            <>
              <span className={`status status-${vendor.verification_status}`}>
                {vendor.verification_status}
              </span>
              <button className="btn btn-outline" disabled={vendor.verification_status !== "verified"} onClick={onAddProduct}>
                <Plus size={15} /> Add product
              </button>
            </>
          )}
        </div>

        <div className="studio-card">
          <div className="studio-icon"><Package /></div>
          <h3>Your listings</h3>
          <p>Keep track of product approvals and inventory.</p>
          <div className="mini-stat"><b>{products.length}</b><span>Total product listings</span></div>
        </div>
      </div>

      <div className="table-card">
        <h3>Product listings</h3>
        {products.map((product) => (
          <div className="listing-row" key={product.id}>
            <span className="listing-emoji">{product.emoji || "🏅"}</span>
            <span><b>{product.name}</b><small>{product.category} · {product.stock} in stock</small></span>
            <strong>{money(product.price)}</strong>
            <span className={`status status-${product.status}`}>{product.status}</span>
          </div>
        ))}
        {!products.length && <p className="muted">Your submitted listings will appear here.</p>}
      </div>
    </section>
  );
}
