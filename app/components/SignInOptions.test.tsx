'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SignInOptions from './SignInOptions';
import { signIn } from 'next-auth/react';

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

describe('SignInOptions Component', () => {
  it('renders all provider buttons', () => {
    render(<SignInOptions variant="full" />);
    expect(screen.getByTitle('Sign In with Google')).toBeInTheDocument();
    expect(screen.getByTitle('Sign In with GitHub')).toBeInTheDocument();
    expect(screen.getByTitle('Sign In with Discord')).toBeInTheDocument();
  });

  it('displays full text when variant is "full"', () => {
    render(<SignInOptions variant="full" />);
    expect(screen.getByText('Sign In with Google')).toBeInTheDocument();
    expect(screen.getByText('Sign In with GitHub')).toBeInTheDocument();
    expect(screen.getByText('Sign In with Discord')).toBeInTheDocument();
  });

  it('displays short text when variant is "short"', () => {
    render(<SignInOptions variant="short" />);
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Discord')).toBeInTheDocument();
    expect(screen.getByTitle('Google')).toBeInTheDocument();
    expect(screen.getByTitle('GitHub')).toBeInTheDocument();
    expect(screen.getByTitle('Discord')).toBeInTheDocument();
  });

  it('displays only icons when variant is "icon-only"', () => {
    render(<SignInOptions variant="icon-only" />);
    expect(screen.queryByText('Sign In with Google')).not.toBeInTheDocument();
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign In with GitHub')).not.toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign In with Discord')).not.toBeInTheDocument();
    expect(screen.queryByText('Discord')).not.toBeInTheDocument();

    expect(screen.getByTitle('Sign In with Google')).toBeInTheDocument();
    expect(screen.getByTitle('Sign In with GitHub')).toBeInTheDocument();
    expect(screen.getByTitle('Sign In with Discord')).toBeInTheDocument();
  });

  it('calls signIn with "google" when Google button is clicked', () => {
    render(<SignInOptions variant="full" />);
    const googleButton = screen.getByTitle('Sign In with Google');
    fireEvent.click(googleButton);
    expect(signIn).toHaveBeenCalledWith('google');
  });

  it('calls signIn with "github" when GitHub button is clicked', () => {
    render(<SignInOptions variant="full" />);
    const githubButton = screen.getByTitle('Sign In with GitHub');
    fireEvent.click(githubButton);
    expect(signIn).toHaveBeenCalledWith('github');
  });

  it('calls signIn with "discord" when Discord button is clicked', () => {
    render(<SignInOptions variant="full" />);
    const discordButton = screen.getByTitle('Sign In with Discord');
    fireEvent.click(discordButton);
    expect(signIn).toHaveBeenCalledWith('discord');
  });
});
