+++
slug = "/blog/mwe-lookup"
date = "2024-03-23"
title = "複数語表現検索：多重集合の部分集合検索"
+++

最近、文中の[複数語表現](https://en.wikipedia.org/wiki/Multiword_expression)（MWE）を見つける手法を考えるのにかなりの時間を使っています。MWEの定義は曖昧であり、定義によってはMWEというカテゴリーに何が入るかも変わりますが、今日はそれを脇に置いてMWEの自動検出について話したいと思います。

MWE検出の方法はさまざまですが、個人的に辞書ベースのものが好きです。簡単にいうと、可能なMWEがたくさんあるリストを与えられて、そのうちのどれが文中に実際にあるかを割り出す手法です。これは以下のようなパイプラインとして表現できます：
1. 文中に存在し得るMWE（「可能なMWE」）を辞書から検索します。辞書が上手く構造化されていないとこの処理が遅いので、この記事の大部分はこれを効率的に行う方法についてです。
2. 検索されたMWEを、可能なMWEに相当する文中の構成素の組み合わせから成る具体的な「候補」に対応付けます。検索されたMWEに相当する単語の各組み合わせを全て見つけることさえできれば可能ですが、これについては記事の最後に説明します。
3. 各「候補」が実際にMWEであるかどうかを判断します。つまり、その構成素が慣用的/非構成的な意味を持つかどうかです。こうするには文脈における意味を判断できるシステムが必要であり、たいていの場合は機械学習に基づいた手法になります。昨年、その方法の1つについて[論文](https://aclanthology.org/2023.findings-emnlp.14/)を出版しましたが、この記事で詳しく解説するには手法が多くて複雑すぎます。

![例文](poster_sentence.png)

上記の文に対して、この3つのステップは以下のようになります：

1. `run_down`, `run_over`, `fall_down`, `fall_over`を検索して可能なMWEとして取得します。
2. これらのMWEを文中の単語の候補組み合わせに対応付ます。（上図の通り）
3. 候補をフィルターして、実際にMWEを構成する候補のみを保持します。`fall_down`と`run_over`は明らかに間違っているし、`run_down`というMWEは「（車両で）人をひく」のような意味なので、`fall_over`だけが残ります。

1つのMWEに対して候補組み合わせがある場合もあります。たとえば、最後の`down`を`over`に置き換えて「I ran down the stairs and fell down」にすると、可能な`run_down`のインスタンスが2つあります。1つ目は`ran`と最初の`down`であり、2つ目は`ran`と二番目の`down`です。この問題に対応しやすくなるため、ステップ＃1と＃2を分割して行うのがおすすめです。

## 可能なMWEの検索
さて、主題のステップ＃1である可能なMWEの検索について語りましょう。MWEの中に、可能な構成が制限されているものもありますが、動詞のMWEも考慮に入れると制限がほとんどありません。まず`She put her beloved dog down`の`put_down`のように、構成素が連続している必要はありません。さらに`the beans have been spilled`の`spill_the_beans`のように、順序さえ保証されていません。最後に、MWEの構成素が重複しないとも限りません。例として`face_to_face`があります。

構成素が順序に従う必要がなく、重複しない保証もないことを考えると、可能なMWEの検索という問題は次のように形式化できます。入力文の単語の多重集合*S*と、可能なMWEごとの多重集合を含む集合*L*が与えられた場合、*S*の部分集合でありかつ*L*に入る要素を見つけることです。

![MWE取得方程式](equation.svg)

その結果、*M*がMWEごとの多重集合の平均要素数とし、最悪計算量は*O(M * |L|)*というかなりひどい上限です。辞書内の全てのMWEが文中の単語の部分集合であるか否かを調べる単純な手法、一文ごとに全てMWE多重集合を処理することになってしまうので、非常に遅くなります。

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

このコードは私のラップトップで1,000文を処理するのに平均して28秒かかります。しかし、[トライ木](https://en.wikipedia.org/wiki/trie)を使用することでこれを大幅に高速化できます[^1]。トライ木は通常、文字から構築されるものですが、文字列ではなくて単語列を扱っているため、この場合は単語から構築することができます。

![MWE trie](mwe_trie.png)

MWEのトライ木を辞書として使用すると、枝を下り続けるのに文中にない単語が必要になったときに中断する深さ優先探索で候補で可能なMWEを集めることができます。つまり、文中の単語の部分集合であるトライ木の部分のみをたどります。

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

