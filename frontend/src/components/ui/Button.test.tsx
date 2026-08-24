import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('rend un <button> par défaut', () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  /**
   * Régression : Slot n'accepte qu'un enfant unique. Passer l'indicateur de
   * chargement à côté de `children` faisait échouer le rendu de toute page
   * contenant un bouton-lien — soit la quasi-totalité de l'application.
   */
  it('rend l’enfant à la place du bouton avec asChild', () => {
    render(
      <Button asChild variant="primary">
        <a href="/demandes">Nouvelle demande</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Nouvelle demande' });
    expect(link).toHaveAttribute('href', '/demandes');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('accepte un enfant contenant lui-même plusieurs nœuds', () => {
    render(
      <Button asChild>
        <a href="/cles">
          <svg aria-hidden />
          Générer une clé
        </a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Générer une clé' })).toBeInTheDocument();
  });

  it('applique les classes de variante à l’enfant', () => {
    render(
      <Button asChild variant="primary" size="sm" className="ma-classe">
        <a href="/x">Lien</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Lien' })).toHaveClass('ma-classe');
  });

  it('affiche un état de chargement et désactive le bouton', () => {
    render(<Button loading>Signer</Button>);
    const btn = screen.getByRole('button', { name: 'Signer' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('ne déclenche pas onClick pendant le chargement', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Signer
      </Button>,
    );
    screen.getByRole('button').click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
