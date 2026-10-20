import React from "react";
import { Package } from "lucide-react";

export type ClientOrder = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  subtotal: number | string;
  shipping_amount: number | string;
  payment_status: string;
  items?: { product_name_snapshot: string; quantity: number }[];
};

type Props = {
  orders: ClientOrder[];
  money: (value: number | string) => string;
  onShop: () => void;
};

export default function ClientDashboard({ orders, money, onShop }: Props) {
  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div className="eyebrow">YOUR SPORTIVO SPACE</div>
        <h1>My account</h1>
        <p>Track your orders and get ready for your next game.</p>
      </div>

      <section className="table-card">
        <h3><Package size={18} style={{ verticalAlign: "middle", marginRight: 8 }} />Your orders</h3>
        {orders.length ? (
          <div className="orders-list">
            {orders.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-top">
                  <div><small>ORDER NUMBER</small><b>{order.order_number}</b></div>
                  <span className={`status status-${order.status}`}>
                    {order.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="order-items">
                  {(order.items ?? []).map((item, index) => (
                    <span key={`${order.id}-${index}`}>
                      {item.product_name_snapshot} × {item.quantity}
                    </span>
                  ))}
                </div>
                <div className="order-bottom">
                  <span>{new Date(order.created_at).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric"
                  })}</span>
                  <b>{money(Number(order.subtotal) + Number(order.shipping_amount))}</b>
                  <small>Demo payment · {order.payment_status}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div>🛍️</div><h3>Your next favourite is out there.</h3>
            <p>Your orders will show up here after checkout.</p>
            <button className="btn btn-dark" onClick={onShop}>Explore gear</button>
          </div>
        )}
      </section>
    </section>
  );
}
