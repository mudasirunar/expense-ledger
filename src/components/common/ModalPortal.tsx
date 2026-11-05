import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
  isOpen?: boolean;
}

export const ModalPortal: React.FC<ModalPortalProps> = ({ children, isOpen = true }) => {
  useEffect(() => {
    if (!isOpen) return;

    // Freeze background scrolling across page, body, and scroll containers
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(children, document.body);
};

