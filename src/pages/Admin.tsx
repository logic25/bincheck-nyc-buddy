import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Admin = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/dd-reports', { replace: true });
  }, [navigate]);

  return null;
};

export default Admin;
