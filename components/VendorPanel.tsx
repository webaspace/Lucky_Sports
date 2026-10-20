"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock3, Package, Pencil, Plus, RotateCcw, Save, Store, Trash2, Truck } from "lucide-react";

type TrackingDetails = { carrier_name: string; tracking_number: string; tracking_url: string };
type VendorPanelProps = {
  data: any;
  money: (amount: number | string) => string;
  openApply: () => void;
  addProduct: () => void;
  onEdit: (product: any) => void;
  onDelete: (id: string) => void;
  onOrderAction: (fulfillmentId: string, status: string, tracking: TrackingDetails) => void;
  onTrackingUpdate: (fulfillmentId: string, tracking: TrackingDetails) => void;
  onReturnPickupAction: (fulfillmentId: string, previousStatus: string, status: string) => void;
  onProposeCategory: (name: string) => Promise<void>;
  onLoadMoreOrders: () => void;
};

const nextFulfillmentStatus: Record<string, string> = {
  pending: "packed",
  packed: "shipped",
  shipped: "out_for_delivery",
  out_for_delivery: "delivered",
};

const nextReturnStatus: Record<string, string> = {
  requested: "scheduled",
  scheduled: "picked_up",
  picked_up: "received",
};

const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function VendorPanel({
  data,
  money,
  openApply,
  addProduct,
  onEdit,
  onDelete,
  onOrderAction,
  onTrackingUpdate,
  onReturnPickupAction,
  onProposeCategory,
  onLoadMoreOrders,
}: VendorPanelProps) {
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, TrackingDetails>>({});
  const [categoryName, setCategoryName] = useState("");
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const vendor = data.vendor;
  const products = data.products || [];
  const categories = data.categories || [];
  const orders = data.orders || [];
  const summary = data.summary || {};
  const activeVendor = vendor?.verification_status === "verified" && vendor?.is_active;

  const trackingFor = (order: any): TrackingDetails => trackingDrafts[order.fulfillment_id] || {
    carrier_name: order.carrier_name || "",
    tracking_number: order.tracking_number || "",
    tracking_url: order.tracking_url || "",
  };

  const proposeCategory = async () => {
    const name = categoryName.trim();
    if (!name || submittingCategory) return;
    setSubmittingCategory(true);
    try {
      await onProposeCategory(name);
      setCategoryName("");
    } catch {
      // The marketplace layer shows the request error to the vendor.
    } finally {
      setSubmittingCategory(false);
    }
  };

  return (
    <section className="dashboard vendor-dashboard">
      <div className="dashboard-heading">
        <div className="eyebrow">YOUR SPORTIVO SPACE</div>
        <h1>Seller studio</h1>
        <p>Manage products, orders, tracking, and return pickups for your store.</p>
      </div>

      <div className="studio-grid">
        <div className="studio-card">
          <div className="studio-icon"><Store /></div>
          <h3>{vendor?.store_name || "Open your sports store"}</h3>
          <p>{vendor ? `Verification: ${vendor.verification_status}. ${vendor.description || ""}` : "Apply to sell sports gear to customers who love the game."}</p>
          {!vendor ? (
            <button className="btn btn-dark" onClick={openApply}>Apply to become a seller</button>
          ) : (
            <>
              <span className={`status status-${vendor.verification_status}`}>{vendor.verification_status}</span>
              {vendor.rejection_reason && <p className="muted">Review note: {vendor.rejection_reason}</p>}
              {vendor.verification_status === "rejected" && <button className="btn btn-dark" onClick={openApply}>Update and resubmit application</button>}
              <button className="btn btn-outline" disabled={!activeVendor} onClick={addProduct}><Plus size={15} /> Add product</button>
            </>
          )}
        </div>

        <div className="studio-card vendor-category-card">
          <div className="studio-icon"><Package /></div>
          <h3>Product categories</h3>
          <p>Suggest a category. Admin approval is required before vendors can list in it and customers can browse it.</p>
          <div className="vendor-category-form">
            <input className="form-input" value={categoryName} maxLength={60} onChange={(event) => setCategoryName(event.target.value)} placeholder="Example: Pickleball" aria-label="New product category" disabled={!activeVendor} />
            <button className="btn btn-dark" type="button" disabled={!activeVendor || !categoryName.trim() || submittingCategory} onClick={proposeCategory}>
              <Plus size={15} /> {submittingCategory ? "Submitting…" : "Suggest"}
            </button>
          </div>
          <div className="vendor-category-list">
            {categories.map((category: any) => (
              <div className="vendor-category-item" key={category.id}>
                <span>{category.name}<small>{category.vendor_id ? `Suggested by ${category.vendor_name || "a vendor"}` : "Imported from existing listings"}</small></span>
                <span className={`status status-${category.status}`}>{category.status}</span>
                {category.rejection_reason && <small>{category.rejection_reason}</small>}
              </div>
            ))}
            {!categories.length && <small className="muted">Your category suggestions will show here.</small>}
          </div>
        </div>
      </div>

      <section className="vendor-metrics" aria-label="Vendor performance">
        <article><Package /><span>Products</span><strong>{summary.total_products ?? products.length}</strong><small>{summary.published_products ?? products.filter((p: any) => p.status === "approved").length} published · {summary.pending_products ?? products.filter((p: any) => p.status === "pending").length} pending</small></article>
        <article className={Number(summary.low_stock_products) > 0 ? "is-warning" : ""}><AlertTriangle /><span>Low stock</span><strong>{summary.low_stock_products ?? products.filter((p: any) => Number(p.stock) < 10).length}</strong><small>Products with fewer than 10 units</small></article>
        <article><Clock3 /><span>Ordered</span><strong>{summary.ordered_orders ?? orders.filter((o: any) => o.fulfillment_status === "pending").length}</strong><small>{summary.ordered_units ?? 0} units waiting to pack</small></article>
        <article><Truck /><span>In progress</span><strong>{summary.in_progress_orders ?? 0}</strong><small>Packed or with the carrier</small></article>
        <article><Check /><span>Delivered</span><strong>{summary.delivered_orders ?? 0}</strong><small>{summary.delivered_units ?? 0} units · {money(Number(summary.delivered_gross || 0))} gross</small></article>
        <article><RotateCcw /><span>Cancelled</span><strong>{summary.cancelled_orders ?? 0}</strong><small>{summary.cancelled_units ?? 0} units · {summary.open_return_pickups ?? 0} open pickups</small></article>
        <article className="vendor-metric-wide"><span>Net earnings from delivered orders</span><strong>{money(Number(summary.delivered_gross || 0) - Number(summary.delivered_commission || 0))}</strong><small>After the recorded marketplace commission. Payouts are not processed by this demo.</small></article>
      </section>

      <div className="table-card">
        <div className="vendor-table-heading">
          <div><h3>Product listings</h3><p className="muted">Keep stock accurate. Low stock is flagged below 10 units.</p></div>
          <button className="btn btn-dark" disabled={!activeVendor} onClick={addProduct}><Plus size={15} /> Add product</button>
        </div>
        {products.map((product: any) => (
          <div className={`listing-row ${Number(product.stock) < 10 ? "listing-low-stock" : ""}`} key={product.id}>
            <span className="listing-emoji">{product.emoji || "🏅"}</span>
            <span className="vendor-listing-name"><b>{product.name}</b><small>{product.category} · {product.stock} in stock{Number(product.stock) < 10 ? " · LOW STOCK" : ""}</small></span>
            <strong>{money(product.price)}</strong>
            <span className={`status status-${product.status}`}>{product.status}</span>
            {product.rejection_reason && <small className="vendor-rejection-note">{product.rejection_reason}</small>}
            <button className="btn btn-small btn-quiet" onClick={() => onEdit(product)} aria-label={`Update ${product.name}`}><Pencil size={14} /> Update</button>
            <button className="btn btn-small btn-danger" onClick={() => onDelete(product.id)} aria-label={`Delete ${product.name}`}><Trash2 size={14} /></button>
          </div>
        ))}
        {!products.length && <p className="muted">Your submitted listings will appear here.</p>}
      </div>

      <div className="table-card vendor-orders-table">
        <div className="vendor-table-heading">
          <div><h3><Truck size={18} /> Orders and return pickups</h3><p className="muted">These records include only items sold by your store.</p></div>
          <div className="vendor-orders-tools"><span className="admin-count">{orders.length} recent vendor orders</span>{data.hasMoreOrders && <button className="btn btn-outline" onClick={onLoadMoreOrders}>Load more orders</button>}</div>
        </div>
        {orders.map((order: any) => {
          const tracking = trackingFor(order);
          const nextStatus = nextFulfillmentStatus[order.fulfillment_status];
          const nextPickup = nextReturnStatus[order.return_pickup_status];
          const cancelled = order.fulfillment_status === "cancelled";
          return (
            <article className="vendor-order-card" key={order.fulfillment_id}>
              <div className="vendor-order-top">
                <div><small>ORDER {order.order_number}</small><span>{new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div>
                <div className="vendor-order-statuses">
                  <span className={`status status-${order.fulfillment_status}`}>{titleCase(order.fulfillment_status)}</span>
                  {order.return_pickup_status !== "none" && <span className={`status status-${order.return_pickup_status}`}>Return: {titleCase(order.return_pickup_status)}</span>}
                </div>
              </div>
              <div className="order-items">{(order.items || []).map((item: any, index: number) => <span key={index}>{item.product_name} × {item.quantity}</span>)}</div>
              <div className="vendor-order-meta"><strong>{money(order.item_total || 0)}</strong><span>{order.item_quantity || 0} units</span></div>
              <p className="muted">Ship to {order.shipping_name} · {order.shipping_phone}<br />{order.shipping_address}</p>

              {!cancelled && order.fulfillment_status !== "delivered" && (
                <div className="vendor-tracking-form">
                  <label>Carrier<input className="form-input" value={tracking.carrier_name} onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.fulfillment_id]: { ...tracking, carrier_name: event.target.value } }))} placeholder="Carrier name" /></label>
                  <label>Tracking number<input className="form-input" value={tracking.tracking_number} onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.fulfillment_id]: { ...tracking, tracking_number: event.target.value } }))} placeholder="Tracking number" /></label>
                  <label>Tracking link<input className="form-input" value={tracking.tracking_url} onChange={(event) => setTrackingDrafts((current) => ({ ...current, [order.fulfillment_id]: { ...tracking, tracking_url: event.target.value } }))} placeholder="https://carrier.example/track/…" /></label>
                  <button className="btn btn-outline" onClick={() => onTrackingUpdate(order.fulfillment_id, tracking)}><Save size={14} /> Save tracking</button>
                  {nextStatus && <button className="btn btn-dark" onClick={() => onOrderAction(order.fulfillment_id, nextStatus, tracking)}><Truck size={14} /> Mark {titleCase(nextStatus)}</button>}
                </div>
              )}

              {cancelled && (
                <div className="vendor-return-panel">
                  <div><b>Return pickup</b><p className="muted">Pickup status: {titleCase(order.return_pickup_status || "none")}</p></div>
                  {nextPickup && <button className="btn btn-outline" onClick={() => onReturnPickupAction(order.fulfillment_id, order.return_pickup_status, nextPickup)}>
                    <RotateCcw size={14} /> Mark {titleCase(nextPickup)}
                  </button>}
                  {order.return_pickup_status === "none" && <small>Waiting for the customer to request a return pickup.</small>}
                  {order.return_pickup_status === "received" && <span className="status status-delivered">Pickup complete</span>}
                </div>
              )}
              {!cancelled && order.return_pickup_status !== "none" && (
                <div className="vendor-return-panel">
                  <div><b>Customer return pickup</b><p className="muted">Pickup from {order.shipping_address}</p></div>
                  {nextPickup && <button className="btn btn-outline" onClick={() => onReturnPickupAction(order.fulfillment_id, order.return_pickup_status, nextPickup)}><RotateCcw size={14} /> Mark {titleCase(nextPickup)}</button>}
                  {order.return_pickup_status === "received" && <span className="status status-delivered">Pickup complete</span>}
                </div>
              )}
              {(order.return_history || []).length > 0 && (
                <ol className="return-history">
                  {order.return_history.map((event: any, index: number) => (
                    <li key={`${event.created_at}-${index}`}>
                      <b>{titleCase(event.status)}</b>
                      <span>{event.note}</span>
                      <time>{new Date(event.created_at).toLocaleString("en-IN")}</time>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
        {!orders.length && <p className="muted">Vendor orders will appear here after a customer places an order.</p>}
      </div>
    </section>
  );
}
