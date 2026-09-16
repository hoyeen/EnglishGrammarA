import { SentenceAnalyzer } from "@/components/SentenceAnalyzer";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#main" aria-label="句析首页">
          <span className="brand__mark" aria-hidden="true">S</span>
          <span>句析</span>
        </a>
        <p className="header-tagline">英语长难句，一眼看懂结构</p>
      </header>

      <main className="page-shell" id="main">
        <section className="hero">
          <p className="eyebrow">ENGLISH SENTENCE ANALYZER</p>
          <h1>粘贴一个看不懂的英文长句</h1>
          <p className="hero__lead">
            用四色看清句子骨架，再用自然中文读懂含义。
            <br />一次输入一个完整句子，30 秒内获得清晰分析。
          </p>
        </section>
        <SentenceAnalyzer />
      </main>

      <footer className="site-footer">
        <span>句子不会保存在本站数据库中，会发送给 DeepSeek 完成分析。</span>
        <span>四色表示句子功能，不表示单词词性。</span>
      </footer>
    </>
  );
}
