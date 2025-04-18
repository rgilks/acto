import type { Metadata } from 'next';
import PageClientContent from './PageClientContent';

export const generateMetadata = (): Metadata => {
  return {
    title: 'acto',
    description: 'An AI-powered adventure game',
  };
};

export default function Page() {
  return <PageClientContent />;
}
