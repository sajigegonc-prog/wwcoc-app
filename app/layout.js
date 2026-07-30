import "./globals.css";

export const metadata = {
  title: "WWCoC セッション管理アプリ",
  description: "ハリー・ポッター×クトゥルフ神話TRPGを、AI KPと一緒に遊ぶための卓管理アプリ。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  );
}
