import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Card({ children, className = '', title }: CardProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-cake-100 p-5 ${className}`}>
      {title && <h3 className="text-sm font-semibold text-cake-700 uppercase tracking-wide mb-3">{title}</h3>}
      {children}
    </div>
  );
}
