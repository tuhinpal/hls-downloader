export default function Layout({ children }) {
  return (
    <>
      <div
        className="flex flex-col justify-center items-center py-5 px-5"
        style={{
          minHeight: "91vh",
        }}
      >
        {children}
      </div>

      <footer className="text-center text-gray-600 text-sm flex flex-col justify-center items-center mb-2">
        <p>
          Made by{" "}
          <a
            className="font-semibold"
            target="_blank"
            rel="noopener"
            href="https://github.com/tuhinpal"
          >
            Tuhin
          </a>{" "}
          with{" "}
          <a
            className="font-semibold"
            target="_blank"
            rel="noopener"
            href="https://vitejs.dev/"
          >
            React+Vite
          </a>
        </p>
        <div className="flex items-center gap-2 mt-2">
          <a
            href="https://github.com/tuhinpal/hls-downloader/"
            target="_blank"
            rel="noopener"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={24}
              height={24}
              viewBox="0 0 24 24"
            >
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-4.466 19.59c-.405.078-.534-.171-.534-.384v-2.195c0-.747-.262-1.233-.55-1.481 1.782-.198 3.654-.875 3.654-3.947 0-.874-.312-1.588-.823-2.147.082-.202.356-1.016-.079-2.117 0 0-.671-.215-2.198.82-.64-.18-1.324-.267-2.004-.271-.68.003-1.364.091-2.003.269-1.528-1.035-2.2-.82-2.2-.82-.434 1.102-.16 1.915-.077 2.118-.512.56-.824 1.273-.824 2.147 0 3.064 1.867 3.751 3.645 3.954-.229.2-.436.552-.508 1.07-.457.204-1.614.557-2.328-.666 0 0-.423-.768-1.227-.825 0 0-.78-.01-.055.487 0 0 .525.246.889 1.17 0 0 .463 1.428 2.688.944v1.489c0 .211-.129.459-.528.385-3.18-1.057-5.472-4.056-5.472-7.59 0-4.419 3.582-8 8-8s8 3.581 8 8c0 3.533-2.289 6.531-5.466 7.59z" />
            </svg>
          </a>

          <a
            href="https://www.producthunt.com/posts/hls-downloader-1?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-hls-downloader-1"
            target="_blank"
            rel="noopener"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 26.245 26.256"
              width={24}
              height={24}
            >
              <path
                d="M26.254 13.128c0 7.253-5.875 13.128-13.128 13.128S-.003 20.382-.003 13.128 5.872 0 13.125 0s13.128 5.875 13.128 13.128"
                fill="#000"
              />
              <path
                d="M14.876 13.128h-3.72V9.2h3.72c1.083 0 1.97.886 1.97 1.97s-.886 1.97-1.97 1.97m0-6.564H8.53v13.128h2.626v-3.938h3.72c2.538 0 4.595-2.057 4.595-4.595s-2.057-4.595-4.595-4.595"
                fill="#fff"
              />
            </svg>
          </a>
        </div>
      </footer>
    </>
  );
}
