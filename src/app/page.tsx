import { StudyTabs } from "@/components/StudyTabs";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#main" aria-label="句析首页">
          <span className="brand__mark" aria-hidden="true">S</span>
          <span>句析</span>
        </a>
        <p className="header-tagline">读懂英文句子、单词和短语</p>
      </header>

      <main className="page-shell" id="main">
        <section className="hero">
          <p className="eyebrow">ENGLISH LEARNING TOOL</p>
          <h1>看懂英文，从句子到短语</h1>
          <p className="hero__lead">
            分析句子结构，或快速翻译单词和短语。
            <br />选择需要的工具，获得清晰的中文理解。
          </p>
        </section>
        <StudyTabs />
      </main>

      <footer className="site-footer">
        <span>输入内容不会保存在本站数据库中，会发送给 AI 完成处理。</span>
        <span>四色表示句子功能，不表示单词词性。</span>
      </footer>
    </>
  );
}
