import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';

export function NotFoundPage(): JSX.Element {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={Compass}
        title="Page introuvable"
        description="Cette adresse ne correspond à aucune page de l'application."
        action={
          <Button variant="primary" size="sm" asChild>
            <Link to="/">Revenir au tableau de bord</Link>
          </Button>
        }
      />
    </Card>
  );
}
