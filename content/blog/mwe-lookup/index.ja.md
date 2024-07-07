+++
slug = "/blog/mwe-lookup"
date = "2024-03-23"
title = "複数語表現検索：多重集合の部分集合検索"
+++

最近、文中の[複数語表現](https://en.wikipedia.org/wiki/Multiword_expression)（MWE）の見つけ方について考えるのにかなりの時間をかけています。MWEの定義は曖昧で、定義次第で何がMWEに該当するかが変わりますが、今日はその点は置いておき、MWEの自動検出について話したいと思います。

MWE検出の方法はさまざまですが、個人的には辞書ベースのものが好きです。簡単に言うと、MWEがたくさんあるリストを与えられて、そのうちのどれが文中に実際にあるかを割り出す手法です。これは以下のようなパイプラインとして表現できます：
1. 文中に存在し得るMWE（「可能なMWE」）を辞書から検索します。これは、辞書データを構成素がすべて文中にあるMWEに絞り込む処理として考えることができます。辞書がうまく構造化されていないとかなり遅くなるので、本記事の大半はこの処理を効率化する方法の説明です。
2. 検索された可能なMWEを構成し得る構成素の組み合わせを全て文中から「候補」として集めます。単純に可能なMWEに相当する単語の各組み合わせを見つける処理になりますが、記事の最後に説明します。
3. 各「候補」が実際にMWEであるかどうかを判断します。つまり、その構成素が慣用的/非構成的な意味を持つかどうかです。こうするには文脈における意味を判断できるシステムが必要で、たいていの場合は機械学習に基づいた手法になります。昨年その方法の1つについて[論文](https://aclanthology.org/2023.findings-emnlp.14/)を出版しましたが、この記事で詳しく解説するには手法が多くて複雑すぎます。

![例文](poster_sentence.png)

上記の文に対して、この3つのステップは以下のようになります：

1. `run_down`, `run_over`, `fall_down`, `fall_over`を検索して可能なMWEとして取得します。これらの4つは、辞書から構成素がすべて文中に含まれているMWEのすべてです。
2. これらのMWEを文中の単語の組み合わせに対応付けて、上図で描写されているように候補を見つけます。
3. 候補をフィルタにかけて、実際にMWEの意味になっている候補に絞り込みます。`fall_down`と`run_over`は明らかに間違っていて、`run_down`というMWEは「（車両で）人をひく」のような意味なので、`fall_over`だけが残ります。

1つのMWEに対して候補の単語組み合わせが複数ある場合もあります。たとえば、最後の`down`を`over`に置き換えて「I ran down the stairs and fell down」にすると、`run_down`の構成し得る組み合わせが2つあります。1つ目は`ran`と最初の`down`であり、2つ目は`ran`と二番目の`down`です。この問題に対応しやすくするためにも、ステップ＃1と＃2を分割して行うのがおすすめです。

## 可能なMWEの検索
さて、主題のステップ＃1である可能なMWEの検索について説明しましょう。MWEの中に、その出現に制約があるものもありますが、動詞のMWEも考慮に入れると汎用的な制約がほとんどありません。まず`She put her beloved dog down`の`put_down`のように、構成素が連続している必要はありません。さらに`the beans have been spilled`の`spill_the_beans`のように、順序さえ保証されていません。最後に、MWEの構成素が重複しないとも限りません。その例として`face_to_face`などがあります。

構成素が順序に従う必要がなく、重複しない保証もないことを考えると、可能なMWEの検索という問題は次のように形式化できます。入力文の単語の多重集合*S*と、可能なMWEごとの多重集合を含む集合*L*が与えられた場合、*S*の部分集合でありかつ*L*に含まれる要素を見つけることです。

![MWE取得方程式](equation.svg)

その結果、*M*をMWEごとの多重集合の平均要素数とし、最悪計算量は*O(M * |L|)*というかなりひどい上限になります。辞書内の各MWEが文中の単語の部分集合であるか否かを調べる単純な手法だと、各文ごとに全てのMWE多重集合を処理することになってしまうので、非常に遅くなります。

```python
class NaiveApproach:
    def __init__(self):
        self.data = [
            (mwe['lemma'], Counter(mwe['constituents']))
            for mwe in get_mwes()
        ]

    def search(self, words: list[str]) -> list[str]:
        word_counter = Counter(words)
        return [
            mwe for mwe, constituents in self.data
            if all(
                word_counter[constituent] >= count
                for constituent, count in constituents.items()
            )
        ]
```

このコードは私のラップトップで1,000文を処理するのに平均して28秒かかります。しかし、[トライ木](https://en.wikipedia.org/wiki/trie)を使用することで大幅に高速化できます[^1]。トライ木は通常、文字から構築されるものですが、この場合は文字ではなくて単語を扱っているため、単語から構築します。

![MWE trie](mwe_trie.png)

MWEのトライ木を辞書として使用すると、枝をたどり続けるには文中にない単語が必要になったときに中断する深さ優先探索で可能なMWEを集めることができます。つまり、文中の単語の部分集合であるトライ木の部分のみをたどることができます。

```python
class TrieNode:
    __slots__ = ['lemma', 'children']

    def __init__(self, lemma: Optional[str]):
    	# lemma represents a possible MWE that terminates at this node
        self.lemma = lemma  
        self.children = {}


class Trie:
    def __init__(self):
        self.tree = self._build_tree(get_mwes())

    def _build_tree(self, mwes: list[dict[str, str]]):
        root = TrieNode(None)
        for mwe in mwes:
            curlevel = root
            for word in mwe['constituents']:
                if word not in curlevel.children:
                    curlevel.children[word] = TrieNode(None)
                curlevel = curlevel.children[word]

            curlevel.lemma = mwe['lemma']

        return root

    def search(self, sentence: list[str]) -> list[str]:
        counter = Counter(sentence)
        results = []
        self._search(self.tree, counter, results)
        return results

    def _search(self, cur_node: TrieNode, counter: Counter, results: list):
        possible_next_constituents = [c for c in counter if counter[c] > 0 and c in cur_node.children]

        for constituent in possible_next_constituents:
            next_node = cur_node.children[constituent]
            counter[constituent] -= 1
            if next_node.lemma is not None:
                results.append(next_node.lemma)
            self._search(next_node, counter, results)
            counter[constituent] += 1
```
---
# 続きは工事中（和訳中）

