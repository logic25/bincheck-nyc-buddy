import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MailX, CheckCircle2, AlertTriangle } from 'lucide-react';

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [state, setState] = useState<'loading' | 'valid' | 'already' | 'invalid' | 'success' | 'error'>('loading');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }

    const validate = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: null,
        });

        // GET validation via query param — use fetch directly
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const result = await res.json();

        if (result.valid) {
          setState('valid');
        } else if (result.already_unsubscribed) {
          setState('already');
        } else {
          setState('invalid');
        }
      } catch {
        setState('invalid');
      }
    };

    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    setProcessing(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ token }),
        }
      );
      const result = await res.json();
      if (result.success) {
        setState('success');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {state === 'loading' && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Verifying your request...</p>
            </>
          )}

          {state === 'valid' && (
            <>
              <MailX className="w-12 h-12 text-muted-foreground mx-auto" />
              <h1 className="text-xl font-semibold">Unsubscribe from Emails</h1>
              <p className="text-muted-foreground text-sm">
                Click the button below to unsubscribe from BinCheckNYC notification emails.
              </p>
              <Button onClick={handleUnsubscribe} disabled={processing} className="w-full">
                {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm Unsubscribe
              </Button>
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h1 className="text-xl font-semibold">You've Been Unsubscribed</h1>
              <p className="text-muted-foreground text-sm">
                You will no longer receive notification emails from BinCheckNYC.
              </p>
              <Button variant="outline" onClick={() => navigate('/')}>Go to Homepage</Button>
            </>
          )}

          {state === 'already' && (
            <>
              <CheckCircle2 className="w-12 h-12 text-muted-foreground mx-auto" />
              <h1 className="text-xl font-semibold">Already Unsubscribed</h1>
              <p className="text-muted-foreground text-sm">
                This email address has already been unsubscribed.
              </p>
              <Button variant="outline" onClick={() => navigate('/')}>Go to Homepage</Button>
            </>
          )}

          {(state === 'invalid' || state === 'error') && (
            <>
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
              <h1 className="text-xl font-semibold">
                {state === 'invalid' ? 'Invalid Link' : 'Something Went Wrong'}
              </h1>
              <p className="text-muted-foreground text-sm">
                {state === 'invalid'
                  ? 'This unsubscribe link is invalid or has expired.'
                  : 'Please try again later or contact support.'}
              </p>
              <Button variant="outline" onClick={() => navigate('/')}>Go to Homepage</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Unsubscribe;
