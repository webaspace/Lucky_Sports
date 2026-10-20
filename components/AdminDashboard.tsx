"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Package,
  Search,
  Store,
  Tags,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type AdminVendor = {
  id: string;
  store_name: string;
  description?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  verification_status: "pending" | "verified" | "rejected";
  is_active: boolean;
  rejection_reason?: string | null;
  created_at?: string;
};

type AdminProduct = {
  id: string;
  name: string;
  category: string;
  brand?: string | null;
  description?: string | null;
  price: number | string;
  stock: number;
  emoji?: string | null;
  status: "pending" | "approved" | "rejected";
  vendor_name?: string | null;
  vendor_id?: string | null;
};

type AdminCategory = {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  vendor_id?: string | null;
  vendor_name?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
};

type Props = {
  vendors: AdminVendor[];
  products: AdminProduct[];
  categories: AdminCategory[];
  commissionRate: number;
  money: (value: number | string) => string;
  onVendorAction: (
    id: string,
    value: "verified" | "rejected",
    reason?: string,
  ) => void;
  onVendorActive: (id: string, active: boolean) => void;
  onProductAction: (
    id: string,
    value: "approved" | "rejected",
    reason?: string,
  ) => void;
  onDeleteProduct: (id: string) => void;
  onCategoryAction: (id: string, value: "approved" | "rejected", reason?: string) => void;
};

type VendorFilter = "all" | "pending" | "verified" | "rejected" | "suspended";
type ProductFilter = "all" | AdminProduct["status"];

export default function AdminDashboard({
  vendors,
  products,
  categories,
  commissionRate,
  money,
  onVendorAction,
  onVendorActive,
  onProductAction,
  onDeleteProduct,
  onCategoryAction,
}: Props) {
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState<VendorFilter>("all");
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AdminCategory["status"]>("pending");

  const normalizedRate = Number.isFinite(commissionRate)
    ? Math.min(Math.max(commissionRate, 0), 1)
    : 0.3;
  const commissionPercent = new Intl.NumberFormat("en-IN", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(normalizedRate);

  const filteredVendors = useMemo(() => {
    const term = vendorSearch.trim().toLowerCase();

    return vendors.filter((vendor) => {
      const matchesSearch = `${vendor.store_name} ${vendor.full_name} ${vendor.email} ${vendor.phone || ""}`
        .toLowerCase()
        .includes(term);
      const suspended = vendor.verification_status === "verified" && !vendor.is_active;
      const matchesStatus =
        vendorFilter === "all" ||
        (vendorFilter === "suspended"
          ? suspended
          : vendor.verification_status === vendorFilter && !suspended);

      return matchesSearch && matchesStatus;
    });
  }, [vendors, vendorSearch, vendorFilter]);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();

    return products.filter((product) => {
      if (!product.vendor_id) return false;

      const matchesSearch = `${product.name} ${product.brand || ""} ${product.category} ${product.vendor_name || ""}`
        .toLowerCase()
        .includes(term);
      const matchesStatus =
        productFilter === "all" || product.status === productFilter;

      return matchesSearch && matchesStatus;
    });
  }, [products, productSearch, productFilter]);

  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesSearch = `${category.name} ${category.rejection_reason || ""}`.toLowerCase().includes(term);
      return matchesSearch && (categoryFilter === "all" || category.status === categoryFilter);
    });
  }, [categories, categorySearch, categoryFilter]);

  const requestVendorRejection = (vendor: AdminVendor) => {
    const reason = window.prompt(
      `Why is ${vendor.store_name}'s application being rejected?`,
      vendor.rejection_reason || "Please provide more business information.",
    );

    if (reason !== null) onVendorAction(vendor.id, "rejected", reason);
  };

  const requestProductRejection = (product: AdminProduct) => {
    const reason = window.prompt(
      `Why is “${product.name}” being rejected?`,
      "Please update the listing details.",
    );

    if (reason !== null) onProductAction(product.id, "rejected", reason);
  };

  const requestCategoryRejection = (category: AdminCategory) => {
    const reason = window.prompt(
      `Why is “${category.name}” being rejected?`,
      category.rejection_reason || "Please suggest a clearer category name.",
    );
    if (reason !== null) onCategoryAction(category.id, "rejected", reason);
  };

  const deleteProduct = (product: AdminProduct) => {
    if (window.confirm(`Delete “${product.name}” from the marketplace?`)) {
      onDeleteProduct(product.id);
    }
  };

  return (
    <section className="dashboard admin-dashboard">
      <header className="dashboard-heading">
        <div className="eyebrow">SPORTIVO / ADMINISTRATION</div>
        <h1>Vendor management</h1>
        <p>Review vendor accounts, manage their products, and see the platform commission per sale.</p>
      </header>

      <section className="table-card admin-section" aria-labelledby="vendor-section-title">
        <div className="admin-section-heading">
          <div>
            <h2 id="vendor-section-title"><Store size={19} /> Vendors</h2>
            <p className="muted">Vendor contact details, application status, and account controls.</p>
          </div>
          <span className="admin-count">{filteredVendors.length} of {vendors.length}</span>
        </div>

        <div className="admin-toolbar">
          <label className="admin-search">
            <Search size={17} />
            <input
              value={vendorSearch}
              onChange={(event) => setVendorSearch(event.target.value)}
              placeholder="Search store, owner, email or phone"
              aria-label="Search vendors"
            />
          </label>
          <select
            value={vendorFilter}
            onChange={(event) => setVendorFilter(event.target.value as VendorFilter)}
            aria-label="Filter vendors by status"
          >
            <option value="all">All vendors</option>
            <option value="pending">Pending applications</option>
            <option value="verified">Verified and active</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected applications</option>
          </select>
        </div>

        <div className="admin-vendor-list">
          {filteredVendors.map((vendor) => {
            const vendorProducts = products.filter((product) => product.vendor_id === vendor.id);
            const suspended = vendor.verification_status === "verified" && !vendor.is_active;
            const status = suspended ? "suspended" : vendor.verification_status;

            return (
              <article className="admin-vendor-card" key={vendor.id}>
                <div className="admin-vendor-card-top">
                  <div className="admin-vendor-title">
                    <span className="admin-vendor-icon"><Store size={19} /></span>
                    <div>
                      <h3>{vendor.store_name}</h3>
                      <span className={`status status-${status}`}>{status.replaceAll("_", " ")}</span>
                    </div>
                  </div>
                  <span className="admin-vendor-product-count">
                    <Package size={15} /> {vendorProducts.length} {vendorProducts.length === 1 ? "product" : "products"}
                  </span>
                </div>

                <p className="admin-vendor-description">
                  {vendor.description?.trim() || "No store description provided."}
                </p>

                <div className="admin-vendor-details">
                  <span><UserRound size={15} /> {vendor.full_name}</span>
                  <a href={`mailto:${vendor.email}`}>{vendor.email}</a>
                  {vendor.phone && <a href={`tel:${vendor.phone}`}>{vendor.phone}</a>}
                  {vendor.created_at && (
                    <span><Clock3 size={15} /> Applied {new Date(vendor.created_at).toLocaleDateString("en-IN")}</span>
                  )}
                </div>

                {vendor.rejection_reason && status === "rejected" && (
                  <p className="admin-rejection-note">Review note: {vendor.rejection_reason}</p>
                )}

                <div className="admin-actions admin-vendor-actions">
                  {vendor.verification_status !== "verified" && (
                    <button
                      className="btn btn-small"
                      onClick={() => onVendorAction(vendor.id, "verified")}
                    >
                      <Check size={14} /> Approve vendor
                    </button>
                  )}
                  {vendor.verification_status === "pending" && (
                    <button className="btn btn-small btn-quiet" onClick={() => requestVendorRejection(vendor)}>
                      <X size={14} /> Reject application
                    </button>
                  )}
                  {vendor.verification_status === "verified" && (
                    <button
                      className={`btn btn-small ${suspended ? "btn-outline" : "btn-quiet"}`}
                      onClick={() => onVendorActive(vendor.id, suspended)}
                    >
                      {suspended ? "Reactivate vendor" : "Suspend vendor"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!filteredVendors.length && (
            <div className="admin-empty">No vendors match these filters.</div>
          )}
        </div>
      </section>

      <section className="table-card admin-section" aria-labelledby="category-section-title">
        <div className="admin-section-heading">
          <div>
            <h2 id="category-section-title"><Tags size={19} /> Product categories</h2>
            <p className="muted">Only approved categories are offered to vendors and shown in customer filters.</p>
          </div>
          <span className="admin-count">{categories.filter((category) => category.status === "pending").length} awaiting review</span>
        </div>

        <div className="admin-toolbar">
          <label className="admin-search">
            <Search size={17} />
            <input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Search category names" aria-label="Search product categories" />
          </label>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)} aria-label="Filter categories by status">
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All categories</option>
          </select>
        </div>

        <div className="admin-category-list">
          {filteredCategories.map((category) => (
            <article className="admin-category-row" key={category.id}>
              <div><strong>{category.name}</strong><small>{category.vendor_id ? `Suggested by ${category.vendor_name || "a vendor"}` : "Imported from existing products"}</small></div>
              <span className={`status status-${category.status}`}>{category.status}</span>
              {category.rejection_reason && <small className="admin-rejection-note">{category.rejection_reason}</small>}
              {category.status === "pending" && <div className="admin-actions">
                <button className="btn btn-small" onClick={() => onCategoryAction(category.id, "approved")}><Check size={14} /> Approve</button>
                <button className="btn btn-small btn-quiet" onClick={() => requestCategoryRejection(category)}><X size={14} /> Reject</button>
              </div>}
            </article>
          ))}
          {!filteredCategories.length && <div className="admin-empty">No categories match this filter.</div>}
        </div>
      </section>

      <section className="table-card admin-section" aria-labelledby="product-section-title">
        <div className="admin-section-heading">
          <div>
            <h2 id="product-section-title"><Package size={19} /> Vendor products</h2>
            <p className="muted">
              Commission is {commissionPercent} of the listed price for each vendor product sold. Amounts below are per unit.
            </p>
          </div>
          <span className="admin-count">{filteredProducts.length} products</span>
        </div>

        <div className="admin-toolbar">
          <label className="admin-search">
            <Search size={17} />
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search product, category or vendor"
              aria-label="Search vendor products"
            />
          </label>
          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value as ProductFilter)}
            aria-label="Filter products by status"
          >
            <option value="all">All product statuses</option>
            <option value="pending">Pending review</option>
            <option value="approved">Published</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table admin-products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Vendor</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Admin commission / unit</th>
                <th>Vendor amount / unit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const price = Math.max(0, Number(product.price) || 0);
                const commission = Math.round(price * normalizedRate * 100) / 100;

                return (
                  <tr key={product.id}>
                    <td>
                      <div className="admin-product-name">
                        <span className="listing-emoji">{product.emoji || "🏅"}</span>
                        <span>
                          <strong>{product.name}</strong>
                          <small>{product.brand || product.category}</small>
                        </span>
                      </div>
                    </td>
                    <td>{product.vendor_name || "Vendor store"}</td>
                    <td><strong>{money(price)}</strong></td>
                    <td>{Number(product.stock) > 0 ? product.stock : "Out of stock"}</td>
                    <td><span className={`status status-${product.status}`}>{product.status === "approved" ? "Published" : product.status}</span></td>
                    <td><strong className="admin-commission-value">{money(commission)}</strong><small>{commissionPercent}</small></td>
                    <td><strong>{money(price - commission)}</strong></td>
                    <td>
                      <div className="admin-actions">
                        {product.status === "pending" && (
                          <>
                            <button className="btn btn-small" onClick={() => onProductAction(product.id, "approved")}>
                              Approve
                            </button>
                            <button className="btn btn-small btn-quiet" onClick={() => requestProductRejection(product)}>
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          className="btn btn-small btn-danger"
                          onClick={() => deleteProduct(product)}
                          aria-label={`Delete ${product.name}`}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredProducts.length && (
                <tr><td colSpan={8} className="admin-empty-cell">No vendor products match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
