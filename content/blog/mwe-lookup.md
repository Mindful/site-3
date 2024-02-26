+++
slug = "/blog/mwe-lookup"
date = "2024-03-23"
title = "Multiword expression lookup: multiset subset retrieval"
+++

I have recently spent quite a bit of time thinking about how to find all of the [multiword expressions](https://en.wikipedia.org/wiki/Multiword_expression) (MWEs) in a sentence. I even wrote a [paper](https://aclanthology.org/2023.findings-emnlp.14/) about it. Multiword expressions are a pretty messy topic and there is a lot of ambiguity about what even counts as an MWE, but for this post we will put that aside and talk about the problem of retrieving relevant MWEs for a given sentence. 

I am fan of lexicon-based approaches to MWE identification, which basically just means that given a very large list of possible MWEs you are trying to figure out which of them might be present in a given sentence. This generally breaks down into a pipeline approach that looks something like this:
1. Retrieve all of the MWEs that _could_ be present in a sentence
2. Map the retrieved MWEs to concrete "candidates", which are combinations of constituent words in the sentence corresponding to a possible MWE
3. Decide if each "candidate" is actually an MWE - that is, whether its constituents take on an idiomatic/non-compositional meaning

#3 above requires a system capable of making judgements about meaning in context, which typically means machine learning based approaches. Assuming that applicable MWEs have already been retrieved, #2 is fairly straightforward and just requires finding each combination of words in the sentence that correspond to a retrieved MWE. For example, given the below sentence, these steps might look like this.

# TODO: image from poster

1. Retrieve `run_down`, `run_over`, `fall_down`, `fall_over` as possible MWEs
2. Map each of these MWEs to candidate groups of words in the sentence, as pictured in the above diagram
3. Filter these so that we keep only the candidates that actually constitute MWEs, which in this case is just `fall_over` (`run_down` as an MWE meaning `(of a vehicle) hit a person or animal and knock them to the ground.`)

Note that in many cases there are multiple candidate word groups for a single MWE. For example, if we replace the last `down` with `over` for `I ran down the stairs and fell down`, there are now at least two possible instances of `run_down` - one for `ran` and the first `down`, and another for `ran` and the second `down`. This is also why it is convenient to split #1 and #2 into separate steps.


## How to retrieve possible MWEs 
While some MWEs have constraints on how they can be formed in a sentence, if we include verbal MWEs there are very few gaurantees. They do not have to be contiguous - see `put_down` in `She put her beloved dog down` - and worse, they do not even have to be in order - see `the beans have been spilled` for `spill_the_beans`. Finally, the constituent words of an MWE are not always unique, such as in `face_to_face`.

Given all of the above, the formalization of our possible MWE retrieval problem is: given a multiset *S* for the input sentence, and a set *L* containing multisets for each possible MWE, find all members of *L* that are strict subsets of *S*. 

# TODO: math symbols

This means a worst case runtime of *O(M * |L|)* where *M* is the average size of an MWE multiset. This is a very expensive upper bound, and consequently the naieve approach below of checking if every possible MWE is a subset of the words in the sentence ends up being very slow. 

```python
class NaieveApproach:
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

This takes about 28 seconds on my laptop to process (call `search()` on) 1,000 sentences. Fortunately, we can make this much faster using a [Trie](https://en.wikipedia.org/wiki/Trie)[^1]. Tries are prefix trees most commonly built out of characters, but because we are dealing with sequences of words, we can also build it out of words. 


<hr/>

[^1]: Note that while the Trie-based approach runs much faster on average, its theoretical worst case runtime is the same as the naive approach. However, getting anywhere near this upper bound with the Trie would require a sentence containing most or all of the MWEs in the lexicon, which is not realistic.







