export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center pb-10 lg:pb-16 px-5 pt-5">
      {children}
    </div>
  );
}
