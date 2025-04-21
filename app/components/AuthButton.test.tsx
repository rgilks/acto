import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthButton from './AuthButton';
import { useSession } from 'next-auth/react';

vi.mock('./UserMenuButton', () => ({
  default: ({ session, variant }: { session: any; variant: string }) => (
    <div data-testid="user-menu-button">
      UserMenuButton Mock - Variant: {variant} - User: {session?.user?.name}
    </div>
  ),
}));

vi.mock('./SignInOptions', () => ({
  default: ({ variant }: { variant: string }) => (
    <div data-testid="sign-in-options">SignInOptions Mock - Variant: {variant}</div>
  ),
}));

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

describe('AuthButton', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockClear();
  });

  it('should render loading skeleton when status is loading', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'loading',
      update: vi.fn(),
    });
    render(<AuthButton />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId('user-menu-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sign-in-options')).not.toBeInTheDocument();
  });

  it('should render UserMenuButton when authenticated', () => {
    const mockSession = {
      user: { name: 'Test User', email: 'test@example.com', image: 'test.jpg', isAdmin: false },
      expires: '1',
    };
    vi.mocked(useSession).mockReturnValue({
      data: mockSession,
      status: 'authenticated',
      update: vi.fn(),
    });
    render(<AuthButton variant="full" />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const userMenuButton = screen.getByTestId('user-menu-button');
    expect(userMenuButton).toBeInTheDocument();
    expect(userMenuButton).toHaveTextContent(
      'UserMenuButton Mock - Variant: full - User: Test User'
    );
    expect(screen.queryByTestId('sign-in-options')).not.toBeInTheDocument();
  });

  it('should render SignInOptions when unauthenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    });
    render(<AuthButton variant="short" />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const signInOptions = screen.getByTestId('sign-in-options');
    expect(signInOptions).toBeInTheDocument();
    expect(signInOptions).toHaveTextContent('SignInOptions Mock - Variant: short');
    expect(screen.queryByTestId('user-menu-button')).not.toBeInTheDocument();
  });

  it('should pass the correct variant prop to UserMenuButton', () => {
    const mockSession = { user: { name: 'Test' }, expires: '1' };
    vi.mocked(useSession).mockReturnValue({
      data: mockSession,
      status: 'authenticated',
      update: vi.fn(),
    });
    render(<AuthButton variant="icon-only" />);
    expect(screen.getByTestId('user-menu-button')).toHaveTextContent('Variant: icon-only');
  });

  it('should pass the correct variant prop to SignInOptions', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    });
    render(<AuthButton variant="full" />);
    expect(screen.getByTestId('sign-in-options')).toHaveTextContent('Variant: full');
  });

  it('should default variant to "full" if not provided', () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    });
    render(<AuthButton />);
    expect(screen.getByTestId('sign-in-options')).toHaveTextContent('Variant: full');
    vi.mocked(useSession).mockReturnValue({
      data: { user: { name: 'Test' }, expires: '1' },
      status: 'authenticated',
      update: vi.fn(),
    });
    render(<AuthButton />);
    expect(screen.getByTestId('user-menu-button')).toHaveTextContent('Variant: full');
  });
});
