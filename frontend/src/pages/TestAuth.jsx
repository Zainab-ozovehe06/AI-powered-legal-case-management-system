import { auth } from '../services/firebase';

export default function TestAuth() {
  const callMe = async () => {
    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error('No logged-in user');
      }

      const token = await user.getIdToken();

      const response = await fetch('http://localhost:5000/api/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      console.log(data);
      alert(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  return (
    <div>
      <h1>Test Auth Route</h1>
      <button onClick={callMe}>Call /api/auth/me</button>
    </div>
  );
}